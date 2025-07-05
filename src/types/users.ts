import { com } from '@earth-app/ocean';
import { DBUser } from '../util/routes/users';
import { DBEvent } from '../util/routes/events';
import { Event } from './events';

// Users

/**
 * UserObject type representing a user in the database.
 * Contains user details and associated account data.
 */
export type UserObject = {
	/**
	 * The user object containing user details.
	 */
	public: User;
	/**
	 * The database user object.
	 */
	database: DBUser;
	/**
	 * The account object associated with the user.
	 * This is an instance of com.earthapp.account.Account.
	 */
	account: com.earthapp.account.Account;
};

/**
 * User type representing a user in the Earth App system.
 * Contains user details such as ID, username, creation date, and associated account.
 */
export type User = {
	id: string;
	username: string;
	fullName?: string;
	created_at: Date;
	updated_at?: Date;
	last_login?: Date;
	account: {
		type: string;
		id: string;
		firstName?: string;
		lastName?: string;
		username: string;
		bio?: string;
		email?: string;
		address?: string;
		country?: string;
		phoneNumber?: number;
		visibility: {
			account: typeof com.earthapp.Visibility.prototype.name;
			name: typeof com.earthapp.account.Privacy.prototype.name;
			bio: typeof com.earthapp.account.Privacy.prototype.name;
			email: typeof com.earthapp.account.Privacy.prototype.name;
			address: typeof com.earthapp.account.Privacy.prototype.name;
			activities: typeof com.earthapp.account.Privacy.prototype.name;
			events: typeof com.earthapp.account.Privacy.prototype.name;
			friends: typeof com.earthapp.account.Privacy.prototype.name;
			last_login: typeof com.earthapp.account.Privacy.prototype.name;
			account_type: typeof com.earthapp.account.Privacy.prototype.name;
		};
	};
	activities?: {
		id: string;
		name: string;
		types: (typeof com.earthapp.activity.ActivityType.prototype.name)[];
	}[];
};

/**
 * Converts an Account object to a User object.
 * @param data The account data to convert.
 * @param privacy The privacy accessibility for the respective fields.
 * @param created_at The creation date of the user (default is current date).
 * @param updated_at The last updated date of the user (default is current date).
 * @param last_login The last login date of the user (default is current date).
 * @returns A User object.
 */
export function toUser(
	data: com.earthapp.account.Account,
	privacy: com.earthapp.account.Privacy,
	created_at: Date = new Date(),
	updated_at: Date = new Date(),
	last_login: Date = new Date()
): User {
	const fullName =
		!data.isFieldPrivate('name', privacy) && data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined;

	const user: User = {
		id: data.id,
		username: data.username,
		fullName: fullName,
		created_at: created_at,
		updated_at: updated_at,
		last_login: last_login,
		account: {
			...JSON.parse(data.toJson()),
			visibility: {
				account: data.visibility.name,
				name: data.getFieldPrivacy('name').name,
				bio: data.getFieldPrivacy('bio').name,
				email: data.getFieldPrivacy('email').name,
				address: data.getFieldPrivacy('address').name,
				activities: data.getFieldPrivacy('activities').name,
				events: data.getFieldPrivacy('events').name,
				friends: data.getFieldPrivacy('friends').name,
				last_login: data.getFieldPrivacy('last_login').name,
				account_type: data.getFieldPrivacy('account_type').name
			}
		}
	};

	// First and Last Name
	if (data.isFieldPrivate('name', privacy)) {
		user.account.firstName = undefined;
		user.account.lastName = undefined;
	}

	// Bio
	if (data.isFieldPrivate('bio', privacy)) {
		user.account.bio = undefined;
	}

	// Email
	if (data.isFieldPrivate('email', privacy)) {
		user.account.email = undefined;
	}

	// Address
	if (data.isFieldPrivate('address', privacy)) {
		user.account.address = undefined;
	}

	// Country
	if (data.isFieldPrivate('country', privacy)) {
		user.account.country = undefined;
	}

	// Phone Number
	if (data.isFieldPrivate('phoneNumber', privacy)) {
		user.account.phoneNumber = undefined;
	}

	// Activities
	if (!data.isFieldPrivate('activities', privacy)) {
		user.activities = data.activities.asJsArrayView().map((activity) => ({
			id: activity.id,
			name: activity.name,
			types: activity.types.asJsArrayView().map((type) => type.name)
		}));
	}

	return user;
}

/**
 * LoginUser type representing a user who has logged in.
 * Contains user ID, username, and session token.
 */
export type LoginUser = {
	id: string;
	username: string;
	session_token: string;
};
