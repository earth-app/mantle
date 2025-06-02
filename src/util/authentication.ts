import { bearerAuth } from 'hono/bearer-auth'
import { basicAuth } from 'hono/basic-auth'
import { D1Database } from '@cloudflare/workers-types'
import * as ocean from '@earth-app/ocean'

import * as encryption from './encryption'
import * as util from "./util"
import Bindings from '../bindings'
import { Context } from 'hono'
import { getUserById } from './users'

type TokenRow = {
    id: number
    owner: string
    token: Uint8Array
    encryption_key: string
    encryption_iv: string
    token_hash: string
    salt: string
    is_session: boolean
    created_at: Date
    expires_at: Date
}

async function checkTableExists(d1: D1Database) {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        expires_at TIMESTAMP DEFAULT (datetime('now', '+30 days'))
    )`
    await d1.prepare(query).run()

    const indexQuery = `CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_lookup_hash ON tokens (lookup_hash)`
    await d1.prepare(indexQuery).run()
}

async function hashToken(token: string, secret: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))
    return util.toBase64(new Uint8Array(sig))
}

// Token Management

export async function addToken(token: string, owner: string, bindings: Bindings, expiration: number = 30, is_session: boolean = false) {
    if (!token || !owner) throw new Error('Token and owner are required')
    if (token.length != ocean.com.earthapp.util.API_KEY_LENGTH) throw new Error(`Token must be ${ocean.com.earthapp.util.API_KEY_LENGTH} characters long`)
    
    const d1 = bindings.DB
    await checkTableExists(d1)
    
    const count = await getTokenCount(owner, d1)
    if (count >= 5 && !is_session) {
        throw new Error('Token limit reached for owner. Please remove an existing token before adding a new one.')
    }

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const tokenHash = await hashToken(token, salt)

    const key = await encryption.generateKey()
    const encryptedKey = await encryption.encryptKey(bindings.KEK, key.key)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedToken = await encryption.encryptData(key.rawKey, new TextEncoder().encode(token), iv)

    const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY)

    const query = `INSERT INTO tokens (owner, token, encryption_key, encryption_iv, token_hash, lookup_hash, salt, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    await d1.prepare(query).bind(
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
    ).run()
}

export async function removeToken(token: string, bindings: Bindings) {
    const d1 = bindings.DB

    await checkTableExists(d1)

    const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY)

    const row = await d1.prepare(`SELECT id, salt, token_hash FROM tokens WHERE lookup_hash = ?`)
        .bind(lookupHash)
        .first<{ id: number, salt: string, token_hash: string }>()

    if (!row) return

    const salt = util.fromBase64(row.salt)
    const tokenHash = await hashToken(token, salt)

    if (tokenHash === row.token_hash) {
        await d1.prepare(`DELETE FROM tokens WHERE id = ?`).bind(row.id).run()
    }
}

export async function isValidToken(token: string, bindings: Bindings) {
    const d1 = bindings.DB

    await checkTableExists(d1)

    const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY)
    const row = await d1.prepare(
        `SELECT token, encryption_key, encryption_iv, salt, token_hash, expires_at FROM tokens WHERE lookup_hash = ?`
    )
    .bind(lookupHash)
    .first<TokenRow>()

    if (!row) return false

    const salt = util.fromBase64(row.salt)
    const tokenHash = await hashToken(token, salt)

    if (tokenHash !== row.token_hash) return false

    const now = new Date()
    if (row.expires_at && new Date(row.expires_at) < now) {
        await removeToken(token, bindings) // Remove expired token
        return false
    }

    const parsedKey = JSON.parse(row.encryption_key)
    const decryptedKey = await encryption.decryptKey(bindings.KEK, {
        key: parsedKey.key,
        iv: parsedKey.iv,
    })

    const decryptedToken = await encryption.decryptData(
        decryptedKey,
        util.fromBase64(row.encryption_iv),
        new Uint8Array(row.token)
    )

    return util.constantTimeEqual(new Uint8Array(decryptedToken), new TextEncoder().encode(token))
}

export async function getTokenCount(owner: string, d1: D1Database) {
    if (!owner) throw new Error('Owner is required')

    await checkTableExists(d1)

    const query = `SELECT COUNT(*) as count FROM tokens WHERE owner = ? AND expires_at > CURRENT_TIMESTAMP AND is_session = FALSE`
    const result = await d1.prepare(query)
        .bind(owner)
        .first<{ count: number }>()

    return result ? result.count : 0
}

export async function getOwnerOfToken(token: string, bindings: Bindings) {
    if (!token) throw new Error('Token is required')
    
    const d1 = bindings.DB
    await checkTableExists(d1)

    const lookupHash = await encryption.computeLookupHash(token, bindings.LOOKUP_HMAC_KEY)
    const row = await d1.prepare(`SELECT owner FROM tokens WHERE lookup_hash = ?`)
        .bind(lookupHash)
        .first<{ owner: string }>()
    
    if (!row) return null

    return await getUserById(row.owner, bindings)
}

// Session Management

export async function validateSessions(owner: string, d1: D1Database) {
    if (!owner) throw new Error('Owner is required')

    await checkTableExists(d1)

    // Remove expired sessions
    const expiredQuery = `DELETE FROM tokens WHERE owner = ? AND expires_at < CURRENT_TIMESTAMP AND is_session = TRUE`
    await d1.prepare(expiredQuery)
        .bind(owner)
        .run()

    // Remove excess sessions
    const sessionCount = await getSessionCount(owner, d1)
    if (sessionCount >= 3) {
        const query = `SELECT id FROM tokens WHERE owner = ? AND is_session = TRUE ORDER BY created_at DESC LIMIT 1 OFFSET 2`
        const result = await d1.prepare(query)
            .bind(owner)
            .all<{ id: number }>()

        if (result.results.length > 0) {
            const idsToDelete = result.results.map(row => row.id)
            const deleteQuery = `DELETE FROM tokens WHERE id IN (${idsToDelete.join(',')})`
            await d1.prepare(deleteQuery).run()
        }
    }
}

export function generateSessionToken() {
    const session = crypto.getRandomValues(new Uint8Array(ocean.com.earthapp.util.API_KEY_LENGTH))
    return util.toBase64(session)
}

export async function addSession(owner: string, bindings: Bindings, expiration: number = 14) {
    if (!owner) throw new Error('Owner is required')
    const session = generateSessionToken()
    await addToken(session, owner, bindings, expiration, true)
    await validateSessions(owner, bindings.DB) // Ensure no more than 3 sessions

    return session
}

export async function removeSession(session: string, bindings: Bindings) {
    if (!session) throw new Error('Session Token is required')
    await removeToken(session, bindings)
}

export async function isValidSession(session: string, bindings: Bindings) {
    if (!session) throw new Error('Session Token is required')
    
    const d1 = bindings.DB

    await checkTableExists(d1)

    const lookupHash = await encryption.computeLookupHash(session, bindings.LOOKUP_HMAC_KEY)
    const row = await d1.prepare(
        `SELECT token, encryption_key, encryption_iv, salt, token_hash, expires_at FROM tokens WHERE lookup_hash = ? AND is_session = TRUE`
    )
    .bind(lookupHash)
    .first<TokenRow>()

    if (!row) return false

    const salt = util.fromBase64(row.salt)
    const tokenHash = await hashToken(session, salt)

    if (tokenHash !== row.token_hash) return false

    const now = new Date()
    if (row.expires_at && new Date(row.expires_at) < now) {
        await removeSession(session, bindings) // Remove expired session
        return false
    }

    const parsedKey = JSON.parse(row.encryption_key)
    const decryptedKey = await encryption.decryptKey(bindings.KEK, {
        key: parsedKey.key,
        iv: parsedKey.iv,
    })

    const decryptedToken = await encryption.decryptData(
        decryptedKey,
        util.fromBase64(row.encryption_iv),
        new Uint8Array(row.token)
    )

    return util.constantTimeEqual(new Uint8Array(decryptedToken), new TextEncoder().encode(session))
}

export async function getSessionCount(owner: string, d1: D1Database) {
    if (!owner) throw new Error('Owner is required')

    await checkTableExists(d1)

    const query = `SELECT COUNT(*) as count FROM tokens WHERE owner = ? AND expires_at > CURRENT_TIMESTAMP AND is_session = TRUE`
    const result = await d1.prepare(query)
        .bind(owner)
        .first<{ count: number }>()
    
    return result ? result.count : 0
}

export async function bumpCurrentSession(owner: string, d1: D1Database) {
    if (!owner) throw new Error('Owner is required')

    await checkTableExists(d1)

    const query = `UPDATE tokens SET expires_at = datetime('now', '+14 days') WHERE owner = ? AND is_session = TRUE ORDER BY created_at DESC LIMIT 1`
    await d1.prepare(query)
        .bind(owner)
        .run()
}

// Middleware

export function bearerAuthMiddleware() {
    return bearerAuth({
        verifyToken: async (token: string, c: Context) => {
            if (token.length !== ocean.com.earthapp.util.API_KEY_LENGTH) return false

            if (token.startsWith('EA25')) return await isValidToken(token, c.env)

            return await isValidSession(token, c.env)
        }
    })
}

export function basicAuthMiddleware() {
    return basicAuth({
        verifyUser: async (username: string, password: string, c: Context) => {
            const user = await c.env.USERS.getUserByUsername(username, c.env)
            if (!user) return false

            const salt = util.fromBase64(user.salt)
            return await encryption.comparePassword(password, salt, util.fromBase64(user.hashedPassword))
        }
    })
}