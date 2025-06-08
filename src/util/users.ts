import { D1Database } from '@cloudflare/workers-types'
import * as ocean from '@earth-app/ocean'
import * as encryption from './encryption'
import * as util from "./util"
import Bindings from '../bindings'
import { UserObject, User, toUser, LoginUser } from '../types/users'
import { addSession } from './authentication'
import { HTTPException } from 'hono/http-exception'

// Helpers

export async function createUser(username: string, callback: (user: ocean.com.earthapp.account.Account) => void) {
    try {
        const id = ocean.com.earthapp.account.Account.newId()
        const user = new ocean.com.earthapp.account.Account(id, username)
        callback(user)

        return user
    } catch (error) {
        throw new HTTPException(401, { message: `Failed to create user: ${error}` })
    }

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

async function toUserObject(row: DBUser, bindings: Bindings): Promise<UserObject> {
    const { binary, encryption_key, encryption_iv } = row
    if (!binary || !encryption_key || !encryption_iv)
        throw new HTTPException(500, { message: 'Missing required fields for decryption' })

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

    const lastLoginIndexQuery = `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login DESC)`
    await d1.prepare(lastLoginIndexQuery).run()

    const createdAtIndexQuery = `CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC)`
    await d1.prepare(createdAtIndexQuery).run()

    const updatedAtIndexQuery = `CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at DESC)`
    await d1.prepare(updatedAtIndexQuery).run()
}

export async function saveUser(user: ocean.com.earthapp.account.Account, password: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)

    if (password.length < 8 || password.length > 100)
        throw new HTTPException(400, { message: 'Password must be between 8 and 100 characters' })

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hashedPassword = await encryption.derivePasswordKey(password, salt)

    const key = await encryption.generateKey()
    const encryptedKey = await encryption.encryptKey(bindings.KEK, key.key)

    const data = new Uint8Array(user.toBinary())
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedData = await encryption.encryptData(key.rawKey, data, iv)

    const exists = `SELECT COUNT(*) as count FROM users WHERE id = ?`
    const countResult = await bindings.DB.prepare(exists)
        .bind(user.id)
        .first<{ count: number }>()

    if (!countResult) throw new HTTPException(500, { message: 'Failed to check user existence' })

    let result: D1Result;
    if (countResult.count > 0) {
        // Update existing user
        const updateQuery = `UPDATE users SET username = ?, password = ?, salt = ?, binary = ?, encryption_key = ?, encryption_iv = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        result = await bindings.DB.prepare(updateQuery).bind(
            user.username,
            util.toBase64(hashedPassword),
            util.toBase64(salt),
            encryptedData,
            JSON.stringify(encryptedKey),
            util.toBase64(iv),
            user.id
        ).run()
    } else {
        // Insert new user
        const query = `INSERT INTO users (id, username, password, salt, binary, encryption_key, encryption_iv) VALUES (?, ?, ?, ?, ?, ?, ?)`
        result = await bindings.DB.prepare(query).bind(
            user.id,
            user.username,
            util.toBase64(hashedPassword),
            util.toBase64(salt),
            encryptedData,
            JSON.stringify(encryptedKey),
            util.toBase64(iv)
        ).run()
    }

    if (!result)
        throw new HTTPException(400, { message: 'Failed to save user' })
    
    if (result.error)
        throw new HTTPException(400, { message: `Database error: ${result.error}` })

    return await getUserById(user.id, bindings)
}

export async function updateUser(user: UserObject, bindings: Bindings) {
    await checkTableExists(bindings.DB)

    const usernameQuery = `UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    await bindings.DB.prepare(usernameQuery)
        .bind(user.account.username, user.database.id)
        .run()
    
    const data = new Uint8Array(user.account.toBinary())
    const encryptionKey = JSON.parse(user.database.encryption_key)
    const decryptedKey = await encryption.decryptKey(
        bindings.KEK,
        {
            key: encryptionKey.key,
            iv: encryptionKey.iv,
        }
    )

    const iv = util.fromBase64(user.database.encryption_iv)
    const encryptedData = await encryption.encryptData(decryptedKey, data, iv)

    const updateBinaryQuery = `UPDATE users SET binary = ? WHERE id = ?`
    await bindings.DB.prepare(updateBinaryQuery)
        .bind(encryptedData, user.database.id)
        .run()
}

async function findUser(query: string, param: string, bindings: Bindings) {
    const result = await bindings.DB.prepare(query)
        .bind(param)
        .all<DBUser>()

    return await Promise.all(result.results.map(async (row) => await toUserObject(row, bindings)))
}

// Login Function

// assume already authenticated via Basic Auth
export async function loginUser(username: string, bindings: Bindings): Promise<LoginUser> {
    await checkTableExists(bindings.DB)

    const dbuser = await getUserByUsername(username, bindings)
    if (!dbuser)
        throw new HTTPException(401, { message: 'User not found' })

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

export async function getUsers(bindings: Bindings, limit: number = 25, page: number = 0) {
    await checkTableExists(bindings.DB)
    const query = `SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`
    const results = await bindings.DB.prepare(query)
        .bind(limit, page * limit)
        .all<DBUser>()

    return Promise.all(results.results.map(async (row) => await toUserObject(row, bindings)))
}

export async function getAccountBy(predicate: (account: ocean.com.earthapp.account.Account) => boolean, bindings: Bindings): Promise<UserObject | null> {
    await checkTableExists(bindings.DB)

    let user: UserObject | null = null;
    let page = 0;
    while (!user) {
        const results = await getUsers(bindings, 100, page)
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

export async function patchUser(account: ocean.com.earthapp.account.Account, data: Partial<ocean.com.earthapp.account.Account>, bindings: Bindings) {
    await checkTableExists(bindings.DB)

    let newAccount = account.deepCopy() as ocean.com.earthapp.account.Account
    newAccount = newAccount.patch(
        data.username ?? account.username,
        data.firstName ?? account.firstName,
        data.lastName ?? account.lastName,
        data.email ?? account.email,
        data.address ?? account.address,
        data.country ?? account.country,
        data.phoneNumber ?? account.phoneNumber,
        data.visibility ?? account.visibility,
    )

    try {
        newAccount.validate()
    } catch (error) {
        throw new HTTPException(400, { message: `Invalid account data: ${error}` })
    }

    const userObject = await getUserById(account.id, bindings)
    if (!userObject) throw new HTTPException(401, { message: 'User not found' })
    
    userObject.account = newAccount
    await updateUser(userObject, bindings)
}

export async function deleteUser(id: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)

    const query = `DELETE FROM users WHERE id = ?`
    const result = await bindings.DB.prepare(query).bind(id).run()

    if (result.error)
        throw new HTTPException(404, { message: 'User not found' })
}