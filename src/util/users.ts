import { D1Database } from '@cloudflare/workers-types'
import * as ocean from '@earth-app/ocean'
import * as encryption from './encryption'
import * as util from "./util"
import Bindings from '../bindings'
import { UserObject, User, toUser, LoginUser } from '../types/users'
import { addSession } from './authentication'

// Helpers

export async function createUser(username: string, callback: (user: ocean.com.earthapp.account.Account) => void) {
    const id = ocean.com.earthapp.account.Account.newId()
    const user = new ocean.com.earthapp.account.Account(id, username)
    callback(user)
    
    return user
}

// Database
export type DBUser = {
    id: string,
    username: string,
    password: string,
    salt: string,
    binary: Uint8Array,
    encryption_key: string,
    encryption_iv: string,
    last_login?: Date,
    created_at: Date,
    updated_at?: Date
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
    )`
    await d1.prepare(query).run()

    // Indexes for performance
    const idIndexQuery = `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users (id)`
    await d1.prepare(idIndexQuery).run()

    const usernameIndexQuery = `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)`
    await d1.prepare(usernameIndexQuery).run()

    const lastLoginIndexQuery = `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login)`
    await d1.prepare(lastLoginIndexQuery).run()

    const updatedAtIndexQuery = `CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at)`
    await d1.prepare(updatedAtIndexQuery).run()
}

export async function saveUser(user: ocean.com.earthapp.account.Account, password: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hashedPassword = await encryption.derivePasswordKey(password, salt)

    const key = await encryption.generateKey()
    const encryptedKey = await encryption.encryptKey(bindings.KEK, key.key)

    const data = new Uint8Array(user.toBinary())
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedData = await encryption.encryptData(key.rawKey, data, iv)

    const query = `INSERT INTO users (id, username, password, salt, binary, encryption_key, encryption_iv) VALUES (?, ?, ?, ?, ?, ?, ?)`
    return await bindings.DB.prepare(query).bind(
        user.id,
        user.username,
        util.toBase64(hashedPassword),
        util.toBase64(salt),
        encryptedData,
        JSON.stringify(encryptedKey),
        util.toBase64(iv)
    ).run()
}

async function findUser(query: string, param: string, bindings: Bindings) {
    const result = await bindings.DB.prepare(query)
        .bind(param)
        .all<DBUser>()

    const users: UserObject[] = await Promise.all(result.results.map(async (row) => {
        const { binary, encryption_key, encryption_iv } = row
        if (!binary || !encryption_key || !encryption_iv)
            throw new Error('Missing required fields')

        const binary0 = new Uint8Array(binary)
        const parsedKey = JSON.parse(encryption_key)
        const decryptedKey = await encryption.decryptKey(
            bindings.KEK,
            {
                key: parsedKey.key,
                iv: parsedKey.iv,
            }
        )
        
        const decryptedData = await encryption.decryptData(
            decryptedKey,
            util.fromBase64(encryption_iv),
            binary0,
        )
        
        const accountData = ocean.fromBinary(new Int8Array(decryptedData)) as ocean.com.earthapp.account.Account

        return { public: toUser(accountData, row.created_at, row.updated_at, row.last_login), database: row, account: accountData }
    }))

    return users
}

// Login Function

// assume already authenticated via Basic Auth
export async function loginUser(username: string, bindings: Bindings): Promise<LoginUser> {
    await checkTableExists(bindings.DB)

    const dbuser = await getUserByUsername(username, bindings)
    if (!dbuser) {
        throw new Error('User not found')
    }

    const user = dbuser.database

    // Create session
    const session = await addSession(user.id, bindings)

    // Update last login
    const query = `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`
    await bindings.DB.prepare(query).bind(user.id).run()

    return {
        id: user.id,
        username: user.username,
        session_token: session
    }
}

// User retrieval functions

export async function getUserById(id: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)
    const results = await findUser("SELECT * FROM users WHERE id = ?", id, bindings)
    return results.length ? results[0] : null
}

export async function getUserByUsername(username: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)
    const results = await findUser("SELECT * FROM users WHERE username = ?", username, bindings)
    return results.length ? results[0] : null
}