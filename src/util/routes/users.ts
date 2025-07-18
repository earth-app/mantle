import { D1Database } from '@cloudflare/workers-types';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { LoginUser, User, UserObject, toUser } from '../../types/users';
import { addSession, getOwnerOfToken } from '../authentication';
import * as encryption from '../encryption';
import * as util from '../util';

import * as ocean from '@earth-app/ocean';
import { com } from '@earth-app/ocean';
import { Context } from 'hono';

// Helpers

export async function createUser(username: string, callback: (user: com.earthapp.account.Account) => void) {
	try {
		const id = com.earthapp.account.Account.newId();
		const user = new com.earthapp.account.Account(id, username);
		callback(user);
		user.validate();

		return user;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to create user: ${error}` });
	}
}

// Database
export type DBUser = {
	id: string;
	username: string;
	password: string;
	salt: string;
	binary: Uint8Array;
	encryption_key: string;
	encryption_iv: string;
	last_login?: Date;
	created_at: Date;
	updated_at?: Date;
};

async function toUserObject(row: DBUser, fieldPrivacy: com.earthapp.account.Privacy, bindings: Bindings): Promise<UserObject> {
	const { binary, encryption_key, encryption_iv } = row;
	if (!binary || !encryption_key || !encryption_iv) throw new HTTPException(500, { message: 'Missing required fields for decryption' });

	const binary0 = new Uint8Array(binary);
	const parsedKey = JSON.parse(encryption_key);
	const decryptedKey = await encryption.decryptKey(bindings.KEK, {
		key: parsedKey.key,
		iv: parsedKey.iv
	});

	const decryptedData = await encryption.decryptData(decryptedKey, util.fromBase64(encryption_iv), binary0);

	const accountData = ocean.fromBinary(new Int8Array(decryptedData)) as com.earthapp.account.Account;

	return { public: toUser(accountData, fieldPrivacy, row.created_at, row.updated_at, row.last_login), database: row, account: accountData };
}

async function checkTableExists(d1: D1Database) {
	const query = `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        salt TEXT NOT NULL,
        binary BLOB NOT NULL,
        encryption_key TEXT NOT NULL,
        encryption_iv TEXT NOT NULL,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
	const result = await d1.prepare(query).run();
	if (result.error) {
		throw new HTTPException(500, { message: `Failed to create users table: ${result.error}` });
	}

	// Indexes for performance
	await d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users (id)`).run();
	await d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login DESC)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at DESC)`).run();
}

// User Functions

// Save User Function

export async function saveUser(user: com.earthapp.account.Account, password: string, bindings: Bindings) {
	await checkTableExists(bindings.DB);

	if (password.length < 8 || password.length > 100)
		throw new HTTPException(400, { message: 'Password must be between 8 and 100 characters' });

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hashedPassword = await encryption.derivePasswordKey(password, salt);

	const key = await encryption.generateKey();
	const encryptedKey = await encryption.encryptKey(bindings.KEK, key.key);

	const data = new Uint8Array(user.toBinary());
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encryptedData = await encryption.encryptData(key.rawKey, data, iv);

	const exists = `SELECT COUNT(*) as count FROM users WHERE id = ?`;
	const countResult = await bindings.DB.prepare(exists).bind(user.id).first<{ count: number }>();

	if (!countResult) throw new HTTPException(500, { message: 'Failed to check user existence' });

	let result: D1Result;
	if (countResult.count > 0) {
		// Update existing user
		const updateQuery = `UPDATE users SET username = ?, password = ?, salt = ?, binary = ?, encryption_key = ?, encryption_iv = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
		result = await bindings.DB.prepare(updateQuery)
			.bind(
				user.username,
				util.toBase64(hashedPassword),
				util.toBase64(salt),
				encryptedData,
				JSON.stringify(encryptedKey),
				util.toBase64(iv),
				user.id
			)
			.run();
	} else {
		// Insert new user
		const query = `INSERT INTO users (id, username, password, salt, binary, encryption_key, encryption_iv) VALUES (?, ?, ?, ?, ?, ?, ?)`;
		result = await bindings.DB.prepare(query)
			.bind(
				user.id,
				user.username,
				util.toBase64(hashedPassword),
				util.toBase64(salt),
				encryptedData,
				JSON.stringify(encryptedKey),
				util.toBase64(iv)
			)
			.run();
	}

	if (!result) throw new HTTPException(400, { message: 'Failed to save user' });

	if (result.error) throw new HTTPException(400, { message: `Database error: ${result.error}` });

	return await getUserById(user.id, bindings);
}

// Update User Function

export async function updateUser(user: UserObject, fieldPrivacy: com.earthapp.account.Privacy, bindings: Bindings): Promise<UserObject> {
	await checkTableExists(bindings.DB);

	const data = new Uint8Array(user.account.toBinary());
	const encryptionKey = JSON.parse(user.database.encryption_key);
	const decryptedKey = await encryption.decryptKey(bindings.KEK, {
		key: encryptionKey.key,
		iv: encryptionKey.iv
	});

	const iv = util.fromBase64(user.database.encryption_iv);
	const encryptedData = await encryption.encryptData(decryptedKey, data, iv);

	const query = `UPDATE users SET username = ?, binary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

	const res = await bindings.DB.prepare(query).bind(user.account.username, encryptedData, user.database.id).run();
	if (!res.success) throw new HTTPException(400, { message: `Database error: ${res.error}` });

	user.public = toUser(user.account, fieldPrivacy, user.database.created_at, user.database.updated_at, user.database.last_login);

	return user;
}

async function findUser(query: string, fieldPrivacy: com.earthapp.account.Privacy, bindings: Bindings, ...params: any[]) {
	const result = await bindings.DB.prepare(query)
		.bind(...params)
		.all<DBUser>();

	return await Promise.all(result.results.map(async (row) => await toUserObject(row, fieldPrivacy, bindings)));
}

// Login Function

// assume already authenticated via Basic Auth
export async function loginUser(username: string, bindings: Bindings): Promise<LoginUser> {
	await checkTableExists(bindings.DB);

	const dbuser = await getUserByUsername(username, bindings);
	if (!dbuser) throw new HTTPException(401, { message: 'User not found' });

	const user = dbuser.database;

	// Create session
	const session = await addSession(user.id, bindings);

	// Update last login
	const query = `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`;
	await bindings.DB.prepare(query).bind(user.id).run();

	return {
		id: user.id,
		username: user.username,
		session_token: session
	};
}

// Routing utilities

export async function getUserFromContext(c: Context<{ Bindings: Bindings }>): Promise<{
	data: UserObject | null;
	message: string;
	status: 200 | 400 | 401 | 403 | 404;
}> {
	const bearerToken = c.req.header('Authorization');
	if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
		return { data: null, message: 'Unauthorized', status: 401 };
	}

	const token = bearerToken.slice(7);
	if (!token) {
		return { data: null, message: 'Unauthorized: Invalid token', status: 401 };
	}

	const path = c.req.param('id');

	let user: UserObject | null;
	const owner = await getOwnerOfToken(token, c.env);

	// Current User
	if (!path) {
		user = owner;
		if (!user) {
			return {
				data: null,
				message: 'Unauthorized: Invalid token',
				status: 401
			};
		}
	} else {
		if (!owner?.account.isAdmin && token !== c.env.ADMIN_API_KEY) {
			return {
				data: null,
				message: 'Forbidden: You do not have permission to access this user.',
				status: 403
			};
		}

		if (path.startsWith('@')) {
			// By Username
			const username = path.slice(1);
			user = await getUserByUsername(username, c.env, com.earthapp.account.Privacy.PRIVATE);
		} else {
			// By ID
			user = await getUserById(path, c.env, com.earthapp.account.Privacy.PRIVATE);
		}
	}

	if (!user) {
		return {
			data: null,
			message: 'User not found',
			status: 404
		};
	}

	return {
		data: user,
		message: 'User found',
		status: 200
	};
}

// User retrieval functions

export async function doesUsernameExist(username: string, bindings: Bindings): Promise<boolean> {
	await checkTableExists(bindings.DB);
	const query = `SELECT COUNT(*) as count FROM users WHERE username = ?`;
	const result = await bindings.DB.prepare(query).bind(username).first<{ count: number }>();
	if (!result) return false;

	return result.count > 0;
}

export async function getUserById(
	id: string,
	bindings: Bindings,
	fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC
) {
	await checkTableExists(bindings.DB);
	const results = await findUser('SELECT * FROM users WHERE id = ? LIMIT 1', fieldPrivacy, bindings, id);
	return results.length ? results[0] : null;
}

export async function getUserByUsername(
	username: string,
	bindings: Bindings,
	fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC
) {
	await checkTableExists(bindings.DB);
	const results = await findUser('SELECT * FROM users WHERE username = ? LIMIT 1', fieldPrivacy, bindings, username);
	return results.length ? results[0] : null;
}

export async function getUsers(
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = '',
	fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC
): Promise<UserObject[]> {
	await checkTableExists(bindings.DB);
	const query = `SELECT * FROM users${search ? ` WHERE username LIKE ?` : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`;

	const statement = bindings.DB.prepare(query);
	let results: D1Result<DBUser>;
	if (search) results = await statement.bind(`%${search}%`, limit, page * limit).all<DBUser>();
	else results = await statement.bind(limit, page * limit).all<DBUser>();

	if (!results || results.error) throw new HTTPException(400, { message: `Database error: ${results.error}` });

	return Promise.all(results.results.map(async (row) => await toUserObject(row, fieldPrivacy, bindings)));
}

export async function getAccountBy(
	predicate: (account: com.earthapp.account.Account) => boolean,
	bindings: Bindings
): Promise<UserObject | null> {
	await checkTableExists(bindings.DB);

	let user: UserObject | null = null;
	let page = 0;
	while (!user) {
		const results = await getUsers(bindings, 100, page, undefined, com.earthapp.account.Privacy.PRIVATE);
		if (results.length === 0) break;

		for (const u of results) {
			if (predicate(u.account)) {
				user = u;
				break;
			}
		}

		page++;
	}

	return user;
}

export async function getUserByEmail(email: string, bindings: Bindings) {
	return await getAccountBy((acc) => acc.email === email, bindings);
}

// User update functions

export async function patchUser(account: com.earthapp.account.Account, bindings: Bindings, data?: DeepPartial<User['account']>) {
	await checkTableExists(bindings.DB);

	const userObject = await getUserById(account.id, bindings, com.earthapp.account.Privacy.PRIVATE);
	if (!userObject) {
		console.error(`User with ID ${account.id} not found`);
		throw new HTTPException(404, { message: 'User not found' });
	}

	let newAccount: com.earthapp.account.Account;

	if (data) {
		newAccount = account.deepCopy() as com.earthapp.account.Account;
		try {
			newAccount.patch(
				data.username ?? account.username,
				(data.firstName ?? account.firstName) || 'John',
				(data.lastName ?? account.lastName) || 'Doe',
				data.email ?? account.email,
				data.address ?? account.address,
				data.country ?? account.country,
				data.phone_number ?? account.phoneNumber,
				com.earthapp.Visibility.valueOf(data.visibility ?? account.visibility.name)
			);
		} catch (error) {
			throw new HTTPException(400, { message: `Failed to patch user: ${error instanceof Error ? error.message : 'Unknown error'}` });
		}
	} else {
		newAccount = account;
	}

	userObject.account = newAccount;
	await updateUser(userObject, com.earthapp.account.Privacy.PRIVATE, bindings);

	return userObject.public;
}

export async function deleteUser(id: string, bindings: Bindings): Promise<boolean> {
	await checkTableExists(bindings.DB);

	const result = await bindings.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();

	return result.success;
}
