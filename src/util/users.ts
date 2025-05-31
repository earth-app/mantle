import { D1Database } from '@cloudflare/workers-types'
import * as ocean from '@earth-app/ocean'
import * as encryption from './encryption'
import * as util from "./util"
import Bindings from '../bindings'

// Helpers

async function createUser(username: string, callback: (user: ocean.com.earthapp.account.Account) => void) {
    const id = ocean.com.earthapp.account.Account.newId()
    const user = new ocean.com.earthapp.account.Account(id, username)
    callback(user)
    return user
}

// Database
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
}

async function saveUser(user: ocean.com.earthapp.account.Account, password: string, bindings: Bindings) {
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
        .all<{
            binary: any,
            encryption_key: string,
            encryption_iv: string
        }>()

    const users = await Promise.all(result.results.map(async (row) => {
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
        
        return ocean.fromBinary(new Int8Array(decryptedData)) as ocean.com.earthapp.account.Account
    }))

    return users
}

async function getUserById(id: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)
    const results = await findUser("SELECT * FROM users WHERE id = ?", id, bindings)
    return results.length ? results[0] : null
}

async function getUserByUsername(username: string, bindings: Bindings) {
    await checkTableExists(bindings.DB)
    const results = await findUser("SELECT * FROM users WHERE username = ?", username, bindings)
    return results.length ? results[0] : null
}

export default {
    createUser,
    saveUser,
    getUserById,
    getUserByUsername,
}