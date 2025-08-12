import { Ai } from '@cloudflare/workers-types';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { LoginUser, toUser, User, UserObject } from '../../types/users';
import { addSession, getOwnerOfBearer, getOwnerOfToken } from '../authentication';
import * as encryption from '../encryption';
import * as util from '../util';

import { allAllShards, createSchemaAcrossShards, first, firstAllShards, KVShardMapper, run } from '@earth-app/collegedb';
import * as ocean from '@earth-app/ocean';
import { com } from '@earth-app/ocean';
import { Context } from 'hono';
import { DBError, ValidationError } from '../../types/errors';
import { collegeDB, init } from '../collegedb';
import * as cache from './cache';

// Helpers

const ADMIN_CREATION_DATE = new Date('2008-07-13T11:54:00Z');
export const ADMIN_USER_OBJECT: UserObject = {
	public: toUser(
		com.earthapp.account.Account.ADMIN_ACCOUNT,
		com.earthapp.account.Privacy.PRIVATE,
		ADMIN_CREATION_DATE,
		ADMIN_CREATION_DATE
	),
	account: com.earthapp.account.Account.ADMIN_ACCOUNT,
	database: {
		id: com.earthapp.account.Account.ADMIN_ACCOUNT.id,
		username: com.earthapp.account.Account.ADMIN_ACCOUNT.username,
		password: '',
		salt: '',
		binary: new Uint8Array(),
		encryption_key: '',
		encryption_iv: '',
		last_login: ADMIN_CREATION_DATE,
		created_at: ADMIN_CREATION_DATE,
		updated_at: ADMIN_CREATION_DATE
	}
};

export function createUser(username: string, callback: (user: com.earthapp.account.Account) => void) {
	try {
		const id = com.earthapp.account.Account.newId();
		const user = new com.earthapp.account.Account(id, username);
		callback(user);
		user.validate();

		return user;
	} catch (error) {
		throw new DBError(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
	if (!binary || !encryption_key || !encryption_iv) throw new DBError(`Missing required fields for decryption`);

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

export async function healthCheck(bindings: Bindings) {
	try {
		await init(bindings);
		const query = `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            salt TEXT NOT NULL,
            binary BLOB NOT NULL,
            encryption_key TEXT NOT NULL,
            encryption_iv TEXT NOT NULL,
            last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users (id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);
        CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login DESC);
        CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at DESC);`;

		await createSchemaAcrossShards(collegeDB.shards, query);
	} catch (error) {
		console.error(`Users Health check failed: ${error}`);
		return false;
	}

	return true;
}

// User Functions

// Save User Function

export async function saveUser(user: com.earthapp.account.Account, password: string, bindings: Bindings) {
	await init(bindings);

	if (password.length < 8 || password.length > 100)
		throw new HTTPException(400, { message: 'Password must be between 8 and 100 characters' });

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hashedPassword = await encryption.derivePasswordKey(password, salt);

	const key = await encryption.generateKey();
	const encryptedKey = await encryption.encryptKey(bindings.KEK, key.key);

	const data = new Uint8Array(user.toBinary());
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encryptedData = await encryption.encryptData(key.rawKey, data, iv);

	const query = `INSERT INTO users (id, username, password, salt, binary, encryption_key, encryption_iv) VALUES (?, ?, ?, ?, ?, ?, ?)`;
	const result = await run(user.id, query, [
		user.id,
		user.username,
		util.toBase64(hashedPassword),
		util.toBase64(salt),
		encryptedData,
		JSON.stringify(encryptedKey),
		util.toBase64(iv)
	]);

	if (!result.success) throw new DBError(`Failed to save user '${user.id}': ${result.error}`);

	const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
	const shard = await mapper.getShardMapping(user.id);
	if (!shard) throw new DBError(`Failed to get shard mapping for user '${user.id}' after creation`);
	await mapper.setShardMapping(user.id, shard.shard, [`username:${user.username}`]);

	await cache.clearCachePrefix(`users:count:`, bindings.KV_CACHE);

	return {
		public: toUser(user, com.earthapp.account.Privacy.PRIVATE, new Date(), new Date(), new Date()),
		account: user,
		database: {
			id: user.id,
			username: user.username,
			password: util.toBase64(hashedPassword),
			salt: util.toBase64(salt),
			binary: encryptedData,
			encryption_key: JSON.stringify(encryptedKey),
			encryption_iv: util.toBase64(iv),
			last_login: new Date(),
			created_at: new Date(),
			updated_at: new Date()
		}
	};
}

// Update User Function

export async function updateUser(user: UserObject, fieldPrivacy: com.earthapp.account.Privacy, bindings: Bindings): Promise<UserObject> {
	await init(bindings);

	const data = new Uint8Array(user.account.toBinary());
	const encryptionKey = JSON.parse(user.database.encryption_key);
	const decryptedKey = await encryption.decryptKey(bindings.KEK, {
		key: encryptionKey.key,
		iv: encryptionKey.iv
	});

	const iv = util.fromBase64(user.database.encryption_iv);
	const encryptedData = await encryption.encryptData(decryptedKey, data, iv);

	const query = `UPDATE users SET username = ?, binary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

	const res = await run(user.database.id, query, [user.account.username, encryptedData, user.database.id]);
	if (!res.success) throw new DBError(`Failed to update user '${user.account.id}': ${res.error}`);

	user.public = toUser(user.account, fieldPrivacy, user.database.created_at, user.database.updated_at, user.database.last_login);

	if (user.account.username !== user.database.username) {
		const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
		const shard = await mapper.getShardMapping(user.database.id);
		if (!shard) throw new DBError(`Failed to get shard mapping for user '${user.database.id}' after update`);
		await mapper.setShardMapping(user.database.id, shard.shard, [`username:${user.account.username}`]);

		user.database.username = user.account.username;
	}

	return user;
}

// Login Function

// assume already authenticated via Basic Auth
export async function loginUser(username: string, bindings: Bindings): Promise<LoginUser> {
	await init(bindings);

	const dbuser = await getUserByUsername(username, bindings);
	if (!dbuser) throw new HTTPException(401, { message: 'User not found, not authorized' });

	const user = dbuser.database;

	// Create session
	const session = await addSession(user.id, bindings);

	// Update last login
	const query = `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`;
	await run(user.id, query, [user.id]);

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
	status: 200 | 401 | 404;
}> {
	const path = c.req.param('id');
	let user: UserObject | null;

	const owner = await getOwnerOfBearer(c);

	// Current User
	if (!path) {
		user = owner;
		if (!user) {
			return {
				data: null,
				status: 401,
				message: 'Unauthorized'
			};
		}
	} else {
		let fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC;
		if (owner) {
			if (owner.account.isAdmin || owner.account.id === path || owner.account.username === path.slice(1)) {
				fieldPrivacy = com.earthapp.account.Privacy.PRIVATE;
			}
		}

		if (path.startsWith('@')) {
			// By Username
			const username = path.slice(1);
			const user0 = await getUserByUsername(username, c.env);
			if (!user0)
				return {
					status: 404,
					message: 'Username not found',
					data: null
				};

			if (owner && user0.account.isAccountInCircle(owner.account)) {
				fieldPrivacy = com.earthapp.account.Privacy.CIRCLE;
			}

			if (owner && user0.account.isMutualFriend(owner.account)) {
				fieldPrivacy = com.earthapp.account.Privacy.MUTUAL;
			}

			user = {
				public: toUser(user0.account, fieldPrivacy, user0.database.created_at, user0.database.updated_at, user0.database.last_login),
				database: user0.database,
				account: user0.account
			};
		} else {
			// By ID
			const user0 = await getUserById(path, c.env);
			if (!user0)
				return {
					status: 404,
					message: 'User ID not found',
					data: null
				};

			if (owner && user0.account.isAccountInCircle(owner.account)) {
				fieldPrivacy = com.earthapp.account.Privacy.CIRCLE;
			}

			if (owner && user0.account.isMutualFriend(owner.account)) {
				fieldPrivacy = com.earthapp.account.Privacy.MUTUAL;
			}

			user = {
				public: toUser(user0.account, fieldPrivacy, user0.database.created_at, user0.database.updated_at, user0.database.last_login),
				database: user0.database,
				account: user0.account
			};
		}
	}

	if (!user) {
		return {
			data: null,
			status: 404,
			message: 'User not found'
		};
	}

	return {
		data: user,
		message: 'User found',
		status: 200
	};
}

export async function getAuthenticatedUserFromContext(c: Context<{ Bindings: Bindings }>): Promise<{
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
		if (token === c.env.ADMIN_API_KEY)
			return {
				data: ADMIN_USER_OBJECT,
				message: 'Admin API Key used, no user object attached',
				status: 200
			};

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

export async function getUsers(
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = '',
	fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC
): Promise<UserObject[]> {
	await init(bindings);

	const offset = page * limit;
	const searchQuery = search ? ' WHERE username LIKE ?' : '';
	const query = `SELECT * FROM users${searchQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
	const params = search ? [`%${search.trim().toLowerCase()}%`, limit, offset] : [limit, offset];

	const results = await allAllShards<DBUser>(query, params);

	const allUsers: DBUser[] = [];
	results.forEach((result) => {
		allUsers.push(...result.results);
	});

	allUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	const paginatedUsers = allUsers.slice(offset, offset + limit);
	return await Promise.all(paginatedUsers.map(async (row) => await toUserObject(row, fieldPrivacy, bindings)));
}

export async function getUsersCount(bindings: Bindings, search: string = ''): Promise<number> {
	const cacheKey = `users:count:${search.trim().toLowerCase()}`;

	return await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
		await init(bindings);
		const query = `SELECT COUNT(*) as count FROM users${search ? ' WHERE username LIKE ?' : ''}`;
		const params = search ? [`%${search.trim().toLowerCase()}%`] : [];
		const result = await firstAllShards<{ count: number }>(query, params);

		if (!result || result.length === 0) return 0;

		return result.filter((r) => r != null).reduce((total, r) => total + (r.count || 0), 0);
	});
}

export async function doesUsernameExist(username: string, bindings: Bindings): Promise<boolean> {
	const cacheKey = `user:exists:${username}`;

	return await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
		await init(bindings);
		const query = `SELECT COUNT(*) as count FROM users WHERE username = ?`;
		const result = await first<{ count: number }>(`username:${username}`, query, [username]);

		if (!result) return false;

		return result.count > 0;
	});
}

export async function getUserById(
	id: string,
	bindings: Bindings,
	fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC
) {
	await init(bindings);
	const result = await first<DBUser>(id, `SELECT * FROM users WHERE id = ? LIMIT 1`, [id]);
	if (!result) return null;

	return await toUserObject(result, fieldPrivacy, bindings);
}

export async function getUserByUsername(
	username: string,
	bindings: Bindings,
	fieldPrivacy: com.earthapp.account.Privacy = com.earthapp.account.Privacy.PUBLIC
) {
	await init(bindings);
	const query = `SELECT * FROM users WHERE username = ? LIMIT 1`;
	const result = await first<DBUser>(`username:${username}`, query, [username]);
	if (!result) return null;

	return await toUserObject(result, fieldPrivacy, bindings);
}

export async function getAccountBy(
	predicate: (account: com.earthapp.account.Account) => boolean,
	bindings: Bindings
): Promise<UserObject | null> {
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

export async function patchUser(userObject: UserObject, bindings: Bindings, data?: DeepPartial<User['account']>) {
	const account = userObject.account;
	if (!account) {
		throw new ValidationError(`User account not found for user ID ${userObject.public.id}`);
	}

	let newAccount: com.earthapp.account.Account;

	if (data) {
		newAccount = account.deepCopy() as com.earthapp.account.Account;
		try {
			if (data.username && data.username !== account.username && (await doesUsernameExist(data.username, bindings))) {
				throw new HTTPException(400, { message: `Username "${data.username}" is already taken.` });
			}

			newAccount.patch(
				data.username ?? account.username,
				(data.firstName ?? account.firstName) || 'John',
				(data.lastName ?? account.lastName) || 'Doe',
				data.bio ?? account.bio,
				data.email ?? account.email,
				data.address ?? account.address,
				data.country ?? account.country,
				data.phone_number ?? account.phoneNumber,
				com.earthapp.Visibility.valueOf(data.visibility ?? account.visibility.name)
			);
		} catch (error) {
			throw new DBError(`Failed to patch user: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	} else {
		newAccount = account;
	}

	userObject.account = newAccount;
	await updateUser(userObject, com.earthapp.account.Privacy.PRIVATE, bindings);

	return userObject.public;
}

export async function deleteUser(id: string, username: string, bindings: Bindings): Promise<boolean> {
	await init(bindings);

	const result = await run(id, `DELETE FROM users WHERE id = ?`);

	const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
	mapper.deleteShardMapping(id);
	mapper.deleteShardMapping(`username:${username}`);

	await cache.clearCache(`user:exists:${username}`, bindings.KV_CACHE);
	await cache.clearCachePrefix(`users:count:`, bindings.KV_CACHE);

	return result.success;
}

// User profile photos

const profileModel = '@cf/bytedance/stable-diffusion-xl-lightning';

export const userProfilePhotoPrompt = (user: User) => {
	return {
		prompt: `
		Generate a heavily expressive, artistic, colorful, vibrant, and unique profile picture for a user with the username "${user.username}."
		The profile picture should be a special representation of the user as a whole, so include lots of vibrant colors and effects in every corner.
		The photo should be around inanimate objects or attributes, avoiding things like people or animals, or symbols that represent them (like toys or paintings.)

		The style of the profile picture should be in a flat, colorful, painting-like tone and style. Whatever you choose, make sure it is vibrant and colorful.
        There should be no text, logos, or any other elements that could be considered as a watermark or branding. The primary object should be placed in the
        center of the image. The background should be a simple, abstract design that complements the primary object without distracting from it.

		For more information about the user, here is the user's biography:
		"${user.account.bio ?? 'No biography provided.'}"

		The user lives in ${user.account.country ?? 'Unknown Country'}. Their name is "${user.fullName ?? 'No name provided.'}."

		Lastly, the like the following activities:
		${user.account.activities.map((activity) => `- ${activity.name}: ${activity.description?.substring(50) ?? 'No description available.'}\n`)}

		If any field says "None Provided" or "Unknown," disregard that element as apart of the profile picture, as the user has omitted said details.
		`.trim(),
		negative_prompt: `Avoid elements of toys, scary elements, political or sensitive statements, and words.`,
		guidance: 35
	} satisfies AiTextToImageInput;
};

export async function generateProfilePhoto(user: User, ai: Ai): Promise<Uint8Array> {
	const profile = await ai.run(profileModel, userProfilePhotoPrompt(user));

	const reader = profile.getReader();
	const chunks: Uint8Array[] = [];
	let done = false;

	while (!done) {
		const { value, done: readerDone } = await reader.read();
		done = readerDone;
		if (value) {
			chunks.push(value);
		}
	}

	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const imageBytes = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		imageBytes.set(chunk, offset);
		offset += chunk.length;
	}

	return imageBytes;
}

export async function getProfilePhoto(user: User, bindings: Bindings): Promise<Uint8Array> {
	const profileImage = `users/${user.id}/profile.png`;

	const bytes = (await bindings.R2.get(profileImage))?.bytes();
	if (bytes) return bytes;

	return (await bindings.ASSETS.fetch('https://assets.local/earth-app.png'))!.bytes();
}

export async function newProfilePhoto(user: User, bindings: Bindings) {
	const profileImage = `users/${user.id}/profile.png`;
	const profile = await generateProfilePhoto(user, bindings.AI);
	await bindings.R2.put(profileImage, profile);

	return profile;
}
