import { D1Database } from '@cloudflare/workers-types';
import { com } from '@earth-app/ocean';
import { basicAuth } from 'hono/basic-auth';
import { bearerAuth } from 'hono/bearer-auth';

import { Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import Bindings from '../bindings';
import * as encryption from './encryption';
import { getUserById, getUserByUsername } from './routes/users';
import * as util from './util';

type TokenRow = {
	id: number;
	owner: string;
	token: Uint8Array;
	encryption_key: string;
	encryption_iv: string;
	token_hash: string;
	salt: string;
	is_session: boolean;
	created_at: Date;
	expires_at: Date;
};

export async function checkTableExists(d1: D1Database) {
	const query = `CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        token BLOB NOT NULL,
        encryption_key TEXT NOT NULL,
        encryption_iv TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        lookup_hash TEXT NOT NULL UNIQUE,
        salt TEXT NOT NULL,
        is_session BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (datetime('now', '+30 days'))
    )`;
	await d1.prepare(query).run();

	const hashIndexQuery = `CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_lookup_hash ON tokens (lookup_hash)`;
	await d1.prepare(hashIndexQuery).run();

	const ownerIndexQuery = `CREATE INDEX IF NOT EXISTS idx_tokens_owner ON tokens (owner)`;
	await d1.prepare(ownerIndexQuery).run();

	const sessionIndexQuery = `CREATE INDEX IF NOT EXISTS idx_tokens_is_session ON tokens (is_session)`;
	await d1.prepare(sessionIndexQuery).run();

	const expiresIndexQuery = `CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens (expires_at)`;
	await d1.prepare(expiresIndexQuery).run();
}

async function hashToken(token: string, secret: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
	return util.toBase64(new Uint8Array(sig));
}

// Token Management

export async function addToken(token: string, owner: string, bindings: Bindings, expiration: number = 30, is_session: boolean = false) {
	if (!token || !owner) throw new Error('Token and owner are required');
	if (token.length != com.earthapp.util.API_KEY_LENGTH)
		throw new Error(`Token must be ${com.earthapp.util.API_KEY_LENGTH} characters long`);

	const d1 = bindings.DB;
	await checkTableExists(d1);

	const count = await getTokenCount(owner, d1);
	if (count >= 5 && !is_session) {
		throw new Error('Token limit reached for owner. Please remove an existing token before adding a new one.');
	}

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const tokenHash = await hashToken(token, salt);

	const key = await encryption.generateKey();
	const encryptedKey = await encryption.encryptKey(bindings.KEK, key.key);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encryptedToken = await encryption.encryptData(key.rawKey, new TextEncoder().encode(token), iv);

	const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY);

	const query = `INSERT INTO tokens (owner, token, encryption_key, encryption_iv, token_hash, lookup_hash, salt, is_session, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
	await d1
		.prepare(query)
		.bind(
			owner,
			encryptedToken,
			JSON.stringify(encryptedKey),
			util.toBase64(iv),
			tokenHash,
			lookupHash,
			util.toBase64(salt),
			is_session,
			Date.now(),
			new Date(Date.now() + expiration * 24 * 60 * 60 * 1000).toISOString()
		)
		.run();
}

export async function removeToken(token: string, bindings: Bindings) {
	const d1 = bindings.DB;

	await checkTableExists(d1);

	const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY);

	const row = await d1
		.prepare(`SELECT id, salt, token_hash FROM tokens WHERE lookup_hash = ?`)
		.bind(lookupHash)
		.first<{ id: number; salt: string; token_hash: string }>();

	if (!row) return;

	const salt = util.fromBase64(row.salt);
	const tokenHash = await hashToken(token, salt);

	if (tokenHash === row.token_hash) {
		await d1.prepare(`DELETE FROM tokens WHERE id = ?`).bind(row.id).run();
	}
}

export async function isValidToken(token: string, bindings: Bindings) {
	const d1 = bindings.DB;

	await checkTableExists(d1);

	const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY);
	const row = await d1.prepare(`SELECT * FROM tokens WHERE lookup_hash = ?`).bind(lookupHash).first<TokenRow>();

	if (!row) return false;

	const salt = util.fromBase64(row.salt);
	const tokenHash = await hashToken(token, salt);

	if (tokenHash !== row.token_hash) return false;

	const now = new Date();
	if (row.expires_at && new Date(row.expires_at) < now) {
		await removeToken(token, bindings); // Remove expired token
		return false;
	}

	const parsedKey = JSON.parse(row.encryption_key);
	const decryptedKey = await encryption.decryptKey(bindings.KEK, {
		key: parsedKey.key,
		iv: parsedKey.iv
	});

	const decryptedToken = await encryption.decryptData(decryptedKey, util.fromBase64(row.encryption_iv), new Uint8Array(row.token));

	return util.constantTimeEqual(new Uint8Array(decryptedToken), new TextEncoder().encode(token));
}

export async function getTokenCount(owner: string, d1: D1Database) {
	if (!owner) throw new Error('Owner is required');

	await checkTableExists(d1);

	const query = `SELECT COUNT(*) as count FROM tokens WHERE owner = ? AND expires_at > CURRENT_TIMESTAMP AND is_session = FALSE`;
	const result = await d1.prepare(query).bind(owner).first<{ count: number }>();

	return result ? result.count : 0;
}

export async function getOwnerOfToken(token: string, bindings: Bindings) {
	if (!token) throw new Error('Token is required');
	if (token == bindings.ADMIN_API_KEY) return null; // Admin API key does not have an owner

	const d1 = bindings.DB;
	await checkTableExists(d1);

	const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY);
	const row = await d1.prepare(`SELECT owner FROM tokens WHERE lookup_hash = ?`).bind(lookupHash).first<{ owner: string }>();

	if (!row) return null;

	return await getUserById(row.owner, bindings, com.earthapp.account.Privacy.PRIVATE);
}

// Session Management

export async function validateSessions(owner: string, d1: D1Database) {
	if (!owner) throw new Error('Owner is required');

	await checkTableExists(d1);

	// Remove expired sessions
	const expiredQuery = `DELETE FROM tokens WHERE owner = ? AND expires_at < CURRENT_TIMESTAMP AND is_session = TRUE`;
	await d1.prepare(expiredQuery).bind(owner).run();

	// Remove excess sessions
	const sessionCount = await getSessionCount(owner, d1);
	if (sessionCount >= 3) {
		const query = `SELECT id FROM tokens WHERE owner = ? AND is_session = TRUE ORDER BY created_at DESC LIMIT 1 OFFSET 2`;
		const result = await d1.prepare(query).bind(owner).all<{ id: number }>();

		if (result.results.length > 0) {
			const idsToDelete = result.results.map((row) => row.id);
			const deleteQuery = `DELETE FROM tokens WHERE id IN (${idsToDelete.join(',')})`;
			await d1.prepare(deleteQuery).run();
		}
	}
}

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function generateSessionToken() {
	let session = '';
	for (let i = 0; i < com.earthapp.util.API_KEY_LENGTH; i++) {
		const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
		session += randomChar;
	}

	return session;
}

export async function addSession(owner: string, bindings: Bindings, expiration: number = 14) {
	if (!owner) throw new Error('Owner is required');
	const session = generateSessionToken();
	await addToken(session, owner, bindings, expiration, true);
	await validateSessions(owner, bindings.DB); // Ensure no more than 3 sessions

	return session;
}

export async function removeSession(session: string, bindings: Bindings) {
	if (!session) throw new Error('Session Token is required');
	await removeToken(session, bindings);
}

export async function isValidSession(session: string, bindings: Bindings) {
	if (!session) throw new Error('Session Token is required');

	const d1 = bindings.DB;

	await checkTableExists(d1);

	const lookupHash = await encryption.computeLookupHash(session, bindings.LOOKUP_HMAC_KEY);
	const row = await d1.prepare(`SELECT * FROM tokens WHERE lookup_hash = ? AND is_session = TRUE`).bind(lookupHash).first<TokenRow>();

	if (!row) return false;

	const salt = util.fromBase64(row.salt);
	const tokenHash = await hashToken(session, salt);

	if (tokenHash !== row.token_hash) return false;

	const now = new Date();
	if (row.expires_at && new Date(row.expires_at) < now) {
		await removeSession(session, bindings); // Remove expired session
		return false;
	}

	const parsedKey = JSON.parse(row.encryption_key);
	const decryptedKey = await encryption.decryptKey(bindings.KEK, {
		key: parsedKey.key,
		iv: parsedKey.iv
	});

	const decryptedToken = await encryption.decryptData(decryptedKey, util.fromBase64(row.encryption_iv), new Uint8Array(row.token));

	return util.constantTimeEqual(new Uint8Array(decryptedToken), new TextEncoder().encode(session));
}

export async function getSessionCount(owner: string, d1: D1Database) {
	if (!owner) throw new Error('Owner is required');

	await checkTableExists(d1);

	const query = `SELECT COUNT(*) as count FROM tokens WHERE owner = ? AND expires_at > CURRENT_TIMESTAMP AND is_session = TRUE`;
	const result = await d1.prepare(query).bind(owner).first<{ count: number }>();

	return result ? result.count : 0;
}

export async function bumpCurrentSession(owner: string, d1: D1Database) {
	if (!owner) throw new Error('Owner is required');

	await checkTableExists(d1);

	const query = `UPDATE tokens SET expires_at = datetime('now', '+14 days') WHERE owner = ? AND is_session = TRUE ORDER BY created_at DESC LIMIT 1`;
	await d1.prepare(query).bind(owner).run();
}

// Authentication Helpers

export function checkVisibility(
	visibility: com.earthapp.Visibility,
	c: Context<{ Bindings: Bindings }>
): { success: false; code: ContentfulStatusCode; message: string } | { success: true } {
	if (!visibility || visibility === com.earthapp.Visibility.PUBLIC) {
		return {
			success: true
		};
	}

	switch (visibility.name.toLowerCase()) {
		// Unlisted - Requires authentication
		case 'unlisted': {
			if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
				return {
					success: false,
					code: 403,
					message: 'Forbidden: This element is unlisted and requires authentication to view.'
				};
			}
			break;
		}
		// Private - Admin & Owner only
		case 'private': {
			if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
				return {
					success: false,
					code: 403,
					message: 'Forbidden: This element is private.'
				};
			}

			const token = c.req.header('Authorization')!.slice(7);
			if (token !== c.env.ADMIN_API_KEY) {
				return {
					success: false,
					code: 403,
					message: 'Forbidden: You do not have permission to view this.'
				};
			}

			break;
		}
	}

	return {
		success: true
	};
}

export async function getOwnerOfBearer(c: Context<{ Bindings: Bindings }>) {
	const bearerToken = c.req.header('Authorization');
	if (!bearerToken || !bearerToken.startsWith('Bearer ')) return null;

	const token = bearerToken.slice(7);
	const user = await getOwnerOfToken(token, c.env);

	return user;
}

// Middleware

export function bearerAuthMiddleware() {
	return bearerAuth({
		verifyToken: async (token: string, c: Context) => {
			if (token.length !== com.earthapp.util.API_KEY_LENGTH) return false;

			if (token.startsWith('EA25')) return await isValidToken(token, c.env);

			return await isValidSession(token, c.env);
		}
	});
}

export function adminMiddleware() {
	return bearerAuth({
		verifyToken: async (token: string, c: Context<{ Bindings: Bindings }>) => {
			if (token.length !== com.earthapp.util.API_KEY_LENGTH) return false;

			const owner = await getOwnerOfToken(token, c.env);
			return token === c.env.ADMIN_API_KEY || owner?.account.isAdmin || false;
		}
	});
}

export function basicAuthMiddleware() {
	return basicAuth({
		verifyUser: async (username: string, password: string, c: Context) => {
			const dbuser = await getUserByUsername(username, c.env);
			if (!dbuser) return false;

			const user = dbuser.database;
			const salt = util.fromBase64(user.salt);
			return await encryption.comparePassword(password, salt, util.fromBase64(user.password));
		}
	});
}
