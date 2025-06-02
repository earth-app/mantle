import * as ocean from '@earth-app/ocean'
import { DBUser } from '../util/users'

/**
 * DBUser type representing a user in the database.
 * Contains user details and associated account data.
 */
export type UserObject = {
    /**
     * The user object containing user details.
     */
    public: User
    /**
     * The database user object.
     */
    database: DBUser
    /**
     * The account object associated with the user.
     * This is an instance of ocean.com.earthapp.account.Account.
     */
    account: ocean.com.earthapp.account.Account
}

/**
 * User type representing a user in the Earth App system.
 * Contains user details such as ID, username, creation date, and associated account.
 */
export type User = {
    id: string;
    username: string;
    created_at: Date;
    updated_at?: Date;
    last_login?: Date;
    account: {
        type: string;
        id: string;
        username: string;
        email?: string;
        address?: string | null;
        country?: string;
        phoneNumber?: number;
        activities?: {
            id: string;
            name: string;
            type: typeof ocean.com.earthapp.activity.ActivityType.prototype.name;
        }[]
    }
}

/**
 * Converts an Account object to a User object.
 * @param data The account data to convert.
 * @param created_at The creation date of the user (default is current date).
 * @param updated_at The last updated date of the user (default is current date).
 * @param last_login The last login date of the user (default is current date).
 * @returns A User object.
 */
export function toUser(data: ocean.com.earthapp.account.Account, created_at: Date = new Date(), updated_at: Date = new Date(), last_login: Date = new Date()): User {
    return {
        id: data.id,
        username: data.username,
        created_at: created_at,
        updated_at: updated_at,
        last_login: last_login,
        account: JSON.parse(data.toJson()),
    }
}

/**
 * LoginUser type representing a user who has logged in.
 * Contains user ID, username, and session token.
 */
export type LoginUser = {
    id: string;
    username: string;
    session_token: string;
}