import z from 'zod';
import 'zod-openapi/extend';
import { resolver } from 'hono-openapi/zod';
import { com } from '@earth-app/ocean';

import { LoginUser, User } from '../types/users';

// Root Types
export function error(code: number, message: string) {
	return z.object({
		code: z.number().openapi({ example: code }),
		message: z.string().openapi({ example: message })
	});
}

export const info = z.object({
	name: z.string().openapi({ example: 'mantle' }),
	title: z.string().openapi({ example: 'Earth App' }),
	version: z.string().openapi({ example: '1.0.0' }),
	description: z.string().openapi({ example: 'Backend API for The Earth App' }),
	date: z.string().openapi({ example: '2025-05-11' })
});

export function paginated(schema: z.ZodTypeAny) {
	return z.object({
		page: z.number().int().min(1).openapi({ example: 1 }),
		limit: z.number().int().min(1).max(100).openapi({ example: 25 }),
		total: z.number().int().min(0).openapi({ example: 100 }),
		items: z.array(schema)
	});
}

// String Types
export const text = z.string().openapi({ example: 'Hello World' });
export const id = z.string().length(com.earthapp.util.ID_LENGTH).openapi({ example: 'eb9137b1272938' });
export const username = z.string().min(4).max(20).openapi({ example: 'johndoe' });
export const password = z.string().min(8).max(100).openapi({ example: 'password123' });
export const email = z.string().email().openapi({ example: 'me@company.com' });
export const date = z.string().datetime().openapi({ example: '2025-05-11T10:00:00Z' });

// Enum Types
export const activityType = z
	.enum(com.earthapp.activity.ActivityType.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'HIKING' });

export const userVisibility = z
	.enum(com.earthapp.Visibility.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'PUBLIC' });

export const userPrivacy = z
	.enum(com.earthapp.account.Privacy.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'MUTUAL' });

// Objects

/// Request Objects
export const userCreate = z.object({
	username: username,
	password: password,
	email: email
});

export const userUpdate = z
	.object({
		username: username.optional(),
		email: email.optional(),
		firstName: z.string().min(1).max(30).optional(),
		lastName: z.string().min(1).max(30).optional()
	})
	.openapi({
		example: {
			username: 'johndoe',
			email: 'new@email.com',
			firstName: 'John',
			lastName: 'Doe'
		}
	});

export const userFieldPrivacy = z
	.object({
		account: userVisibility,
		name: userPrivacy,
		bio: userPrivacy,
		email: userPrivacy,
		address: userPrivacy,
		activities: userPrivacy,
		events: userPrivacy,
		friends: userPrivacy,
		last_login: userPrivacy,
		account_type: userPrivacy
	})
	.openapi({
		example: {
			account: 'UNLISTED',
			name: 'PUBLIC',
			bio: 'PUBLIC',
			email: 'CIRCLE',
			address: 'PRIVATE',
			activities: 'PUBLIC',
			events: 'PUBLIC',
			friends: 'MUTUAL',
			last_login: 'CIRCLE',
			account_type: 'PUBLIC'
		}
	});

/// Return Objects

export const user = z
	.object({
		id: id,
		username: username,
		created_at: date,
		updated_at: date,
		last_login: date.optional(),
		account: z.object({
			type: z.string().openapi({ example: 'com.earthapp.account.Account' }),
			id: id,
			username: username,
			email: email,
			country: z.string().optional(),
			phoneNumber: z.number().int().optional(),
			visibility: userFieldPrivacy
		}),
		activities: z.array(
			z.object({
				id: z.string().openapi({ example: 'hiking' }),
				name: text,
				types: z.array(activityType)
			})
		)
	})
	.openapi({
		example: {
			id: 'eb9137b1272938',
			username: 'johndoe',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			last_login: new Date().toISOString(),
			account: {
				type: 'com.earthapp.account.Account',
				id: 'account123',
				username: 'johndoe',
				email: 'account@gmail.com',
				country: 'US',
				phoneNumber: 1234567890,
				visibility: {
					account: 'UNLISTED',
					name: 'PUBLIC',
					bio: 'MUTUAL',
					email: 'PRIVATE',
					address: 'PRIVATE',
					activities: 'CIRCLE',
					events: 'PUBLIC',
					friends: 'MUTUAL',
					last_login: 'CIRCLE',
					account_type: 'PUBLIC'
				}
			},
			activities: [
				{
					id: 'hiking',
					name: 'Hiking',
					types: ['HOBBY', 'SPORT']
				}
			]
		}
	});
export const users = z.array(user);
export const loginResponse = z.custom<LoginUser>().openapi({
	example: {
		id: 'eb9137b1272938',
		username: 'johndoe',
		session_token: 'abc123xyz456'
	}
});

export const eventType = z
	.enum(com.earthapp.event.EventType.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'IN_PERSON' });

export const event = z
	.object({
		id: id,
		hostId: id,
		name: text,
		description: text,
		type: eventType,
		activities: z.array(activityType).openapi({
			example: ['HOBBY', 'SPORT']
		}),
		location: z.object({
			latitude: z.number().openapi({ example: 37.7749 }),
			longitude: z.number().openapi({ example: -122.4194 })
		}),
		date: date.openapi({ example: '2025-05-11T10:00:00Z' }),
		endDate: date.openapi({ example: '2025-05-11T12:00:00Z' })
	})
	.openapi({
		example: {
			id: 'event123',
			hostId: 'eb9137b1272938',
			name: 'Community Cleanup',
			description: 'Join us for a community cleanup event in the park.',
			type: 'IN_PERSON',
			activities: ['HOBBY', 'SPORT'],
			location: {
				latitude: 37.7749,
				longitude: -122.4194
			},
			date: '2025-05-11T10:00:00Z',
			endDate: '2025-05-11T12:00:00Z'
		}
	});
export const events = z.array(event);

// Reponse Schemas

export const badRequest = {
	description: 'Bad request',
	content: {
		'application/json': {
			schema: resolver(error(400, 'Bad Request'))
		}
	}
};

export const unauthorized = {
	description: 'Unauthorized',
	content: {
		'application/json': {
			schema: resolver(error(401, 'Unauthorized'))
		}
	}
};

export const forbidden = {
	description: 'Forbidden',
	content: {
		'application/json': {
			schema: resolver(error(403, 'Forbidden'))
		}
	}
};
