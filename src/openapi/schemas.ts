import { com } from '@earth-app/ocean';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import z from 'zod';
import 'zod-openapi/extend';

import { DescribeRouteOptions } from 'hono-openapi';
import { LoginUser } from '../types/users';

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
	return z
		.object({
			page: z.number().int().min(1).openapi({ example: 1, description: 'Current page number' }),
			limit: z.number().int().min(1).max(100).openapi({ example: 25, description: 'Number of items per page' }),
			total: z.number().int().min(0).openapi({ example: 100, description: 'Total number of items' }),
			items: z.array(schema).openapi({ description: 'List of items on the current page' })
		})
		.openapi({
			description: 'Paginated response',
			example: {
				page: 1,
				limit: 25,
				total: 100,
				items: [
					{
						id: 'eb9137b1272938',
						username: 'johndoe',
						created_at: '2025-05-11T10:00:00Z',
						updated_at: '2025-05-11T12:00:00Z'
					}
				]
			}
		});
}

export const paginatedParameters = [
	{
		name: 'page',
		in: 'query',
		description: 'Page number (default: 1)',
		required: false,
		schema: {
			type: 'integer',
			minimum: 1,
			default: 1
		}
	},
	{
		name: 'limit',
		in: 'query',
		description: 'Number of items per page (default: 25, max: 250)',
		required: false,
		schema: {
			type: 'integer',
			minimum: 1,
			maximum: 250,
			default: 25
		}
	},
	{
		name: 'search',
		in: 'query',
		description: 'Search query (max 40 characters)',
		required: false,
		schema: {
			type: 'string',
			maxLength: 40,
			default: ''
		}
	}
] satisfies DescribeRouteOptions['parameters'];
export const paginatedParams = z.object({
	page: z.number().min(1).default(1),
	limit: z.number().min(1).max(250).default(25),
	search: z.string().max(40).default('')
});

// String Types
export const text = z.string().openapi({ example: 'Hello World' });
export const id = z.string().length(com.earthapp.util.ID_LENGTH).openapi({ example: 'ebfjwHLdiqBudn3eyd83g1bs' });
export const username = z.string().min(4).max(20).openapi({ example: 'johndoe' });
export const password = z.string().min(8).max(100).openapi({ example: 'password123' });
export const email = z.string().email().openapi({ example: 'me@company.com' });
export const date = z.string().datetime().openapi({ example: '2025-05-11T10:00:00Z' });
export const hexCode = z
	.string()
	.length(7)
	.regex(/^#[0-9A-Fa-f]{6}$/)
	.openapi({ example: '#ffd700', description: 'A valid hex color code' });

export const usernameParam = {
	type: 'string',
	minLength: 5,
	maxLength: 21,
	pattern: '^@([a-zA-Z0-9_]{3,20})$',
	example: '@johndoe'
} satisfies OpenAPIV3.ParameterObject['schema'];

export const idParam = {
	type: 'string',
	minLength: com.earthapp.util.ID_LENGTH,
	maxLength: com.earthapp.util.ID_LENGTH,
	example: 'eyb2cCNwc73b197cnsHbDqiU'
} satisfies OpenAPIV3.ParameterObject['schema'];

export const idNumberParam = {
	type: 'integer',
	minimum: 1,
	example: 123
} satisfies OpenAPIV3.ParameterObject['schema'];

// Enum Types
export const activityType = z
	.enum(com.earthapp.activity.ActivityType.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'HIKING' });

export const visibility = z
	.enum(com.earthapp.Visibility.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'PUBLIC' });

export const userPrivacy = z
	.enum(com.earthapp.account.Privacy.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'MUTUAL' });

export const eventType = z
	.enum(com.earthapp.event.EventType.values().map((v) => v.name) as [string, ...string[]])
	.openapi({ example: 'IN_PERSON' });

// Array Types
export const stringArray = z.array(z.string()).openapi({
	example: ['example1', 'example2', 'example3']
});

export const idArray = z.array(id).openapi({
	example: ['eb9137b1272938', 'audyrehwJd9wjfoz98enfoaw']
});

// Objects

/// Request Objects
export const userCreate = z.object({
	username: username,
	password: password,
	email: email,
	firstName: z.string().min(1).max(30).optional(),
	lastName: z.string().min(1).max(30).optional()
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
		account: visibility,
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

export const eventCreate = z
	.object({
		name: text,
		description: text.optional(),
		type: eventType,
		location: z
			.object({
				latitude: z.number().openapi({ example: 37.7749 }),
				longitude: z.number().openapi({ example: -122.4194 })
			})
			.optional(),
		date: z.number().int().openapi({ example: 1736400000000 }),
		end_date: z.number().int().optional().openapi({ example: 1736403600000 }),
		visibility: visibility
	})
	.openapi({
		example: {
			name: 'Community Cleanup',
			description: 'Join us for a community cleanup event in the park.',
			type: 'IN_PERSON',
			location: {
				latitude: 37.7749,
				longitude: -122.4194
			},
			date: 1736400000000,
			end_date: 1736403600000,
			visibility: 'PRIVATE'
		}
	});

export const eventUpdate = z
	.object({
		hostId: id.optional(),
		name: text.optional(),
		description: text.optional(),
		type: eventType,
		activities: z.array(activityType).optional(),
		location: z
			.object({
				latitude: z.number().openapi({ example: 37.7749 }),
				longitude: z.number().openapi({ example: -122.4194 })
			})
			.optional(),
		date: date.optional(),
		endDate: date.optional(),
		visibility: visibility.optional()
	})
	.openapi({
		example: {
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

export const promptCreate = z
	.object({
		prompt: text,
		visibility: userPrivacy.optional().default('PUBLIC')
	})
	.openapi({
		example: {
			prompt: 'What is the meaning of life?',
			visibility: 'PUBLIC'
		}
	});

export const promptResponseBody = z
	.object({
		content: text.max(700)
	})
	.openapi({
		example: {
			content: 'The meaning of life is 42.'
		}
	});

export const articleCreate = z
	.object({
		title: text.max(48).openapi({ example: 'Understanding Quantum Computing', description: 'The title of the article' }),
		description: text.max(512).openapi({ description: 'A brief description of the article' }),
		tags: z.array(text.max(30)).max(10).default([]).openapi({ description: 'Tags for the article, max 10 tags, each max 30 characters' }),
		content: text.min(50).max(10000).openapi({ description: 'The main content of the article, min 50 characters, max 10000 characters' }),
		color: hexCode.optional()
	})
	.openapi({
		example: {
			title: 'Understanding Quantum Computing',
			description: 'A deep dive into the principles of quantum computing and its potential applications.',
			tags: ['quantum', 'computing', 'technology'],
			content:
				'Quantum computing is a type of computation that harnesses the principles of quantum mechanics. ' +
				'It uses quantum bits, or qubits, which can exist in multiple states simultaneously, allowing for parallel processing of information. ' +
				'This capability enables quantum computers to solve certain problems much faster than classical computers.',
			color: '#cf11ff'
		}
	});

export const articleUpdate = z
	.object({
		title: text.max(48).optional(),
		description: text.max(512).optional(),
		tags: z.array(text.max(30)).max(10).default([]).optional(),
		content: text.min(50).max(10000).optional(),
		color: hexCode.optional()
	})
	.openapi({
		example: {
			title: 'Understanding Quantum Computing',
			description: 'A deep dive into the principles of quantum computing and its potential applications.',
			tags: ['quantum', 'computing', 'technology'],
			content:
				'Quantum computing is a type of computation that harnesses the principles of quantum mechanics. ' +
				'It uses quantum bits, or qubits, which can exist in multiple states simultaneously, allowing for parallel processing of information. ' +
				'This capability enables quantum computers to solve certain problems much faster than classical computers.',
			color: '#cf11ff'
		}
	});

export const activityCreate = z
	.object({
		id: z.string().openapi({ example: 'hiking' }),
		name: text,
		description: text.optional(),
		types: z.array(activityType),
		aliases: z.array(z.string()).optional()
	})
	.openapi({
		example: {
			id: 'hiking',
			name: 'Hiking',
			description: 'A fun outdoor activity',
			types: ['HOBBY', 'SPORT'],
			aliases: ['walking', 'trekking']
		}
	});

export const activityUpdate = z
	.object({
		name: text.optional(),
		description: text.optional(),
		types: z.array(activityType).optional(),
		aliases: z.array(z.string()).optional()
	})
	.openapi({
		example: {
			name: 'Mountain Hiking',
			description: 'A challenging outdoor activity in the mountains',
			types: ['HOBBY', 'SPORT'],
			aliases: ['mountaineering', 'trekking']
		}
	});

export const userActivitiesSet = z
	.array(z.string())
	.min(1)
	.openapi({
		example: ['hiking', 'swimming', 'cycling']
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
		endDate: date.openapi({ example: '2025-05-11T12:00:00Z' }),
		visibility: visibility
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
			endDate: '2025-05-11T12:00:00Z',
			visibility: 'PRIVATE'
		}
	});
export const events = z.array(event);

export const activity = z
	.object({
		id: z.string().openapi({ example: 'hiking' }),
		name: text,
		description: text.optional(),
		types: z.array(activityType).openapi({
			example: ['HOBBY', 'SPORT']
		}),
		created_at: date,
		updated_at: date.optional()
	})
	.openapi({
		example: {
			id: 'hiking',
			name: 'Hiking',
			description: 'A fun outdoor activity',
			types: ['HOBBY', 'SPORT'],
			created_at: '2025-05-11T10:00:00Z',
			updated_at: '2025-05-11T12:00:00Z'
		}
	});
export const activities = z.array(activity);

export const prompt = z
	.object({
		id: z.number().positive().openapi({ example: 123 }),
		prompt: text,
		visibility: userPrivacy,
		created_at: date,
		updated_at: date.optional()
	})
	.openapi({
		example: {
			id: 123,
			prompt: 'What is the meaning of life?',
			visibility: 'PUBLIC',
			created_at: '2025-05-11T10:00:00Z',
			updated_at: '2025-05-11T12:00:00Z'
		}
	});
export const prompts = z.array(prompt);

export const promptResponse = z
	.object({
		id: z.number().int().positive().openapi({ example: 456 }),
		prompt_id: z.number().positive().openapi({ example: 123 }),
		response: text,
		created_at: date,
		updated_at: date.optional()
	})
	.openapi({
		example: {
			id: 456,
			prompt_id: 123,
			response: 'The meaning of life is 42.',
			created_at: '2025-05-11T10:00:00Z',
			updated_at: '2025-05-11T12:00:00Z'
		}
	});
export const promptResponses = z.array(promptResponse);

export const article = z
	.object({
		id: id,
		article_id: z.string().openapi({ example: 'article123' }),
		title: text.max(48),
		summary: text.max(512),
		tags: z.array(text.max(30)).max(10).default([]),
		content: text.min(50).max(10000),
		created_at: date,
		updated_at: date.optional(),
		ocean: z
			.object({
				title: text,
				url: z.string().url(),
				author: text,
				source: text,
				links: z.record(z.string().url()).optional(),
				abstract: text,
				content: text,
				theme_color: z.string().optional(),
				keywords: z.array(text).optional(),
				date: date,
				favicon: z.string().url().optional()
			})
			.optional()
	})
	.openapi({
		example: {
			id: 'cbfjwIXdiqBwdn4dyd83g9cq',
			article_id: 'article123',
			title: 'Understanding Quantum Computing',
			summary: 'A deep dive into the principles of quantum computing and its potential applications.',
			tags: ['quantum', 'computing', 'technology'],
			content:
				'Quantum computing is a type of computation that harnesses the principles of quantum mechanics. ' +
				'It uses quantum bits, or qubits, which can exist in multiple states simultaneously, allowing for parallel processing of information. ' +
				'This capability enables quantum computers to solve certain problems much faster than classical computers.',
			created_at: '2025-05-11T10:00:00Z',
			updated_at: '2025-05-11T12:00:00Z',
			ocean: {
				title: 'Understanding Quantum Computing',
				url: 'https://example.com/quantum-computing',
				author: 'John Doe',
				source: 'Tech Journal',
				links: {
					related: 'https://example.com/quantum-computing/related',
					more_info: 'https://example.com/quantum-computing/more-info'
				},
				abstract: 'A brief overview of quantum computing principles.',
				content:
					'Quantum computing is a type of computation that harnesses the principles of quantum mechanics. ' +
					'It uses quantum bits, or qubits, which can exist in multiple states simultaneously, allowing for parallel processing of information. ' +
					'This capability enables quantum computers to solve certain problems much faster than classical computers.',
				theme_color: '#ff11ff',
				keywords: ['quantum', 'computing', 'technology'],
				date: '5/11/2025',
				favicon: 'https://example.com/quantum-computing/favicon.ico'
			}
		}
	});

// Response Schemas

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

export const duplicate = {
	description: 'Duplicate entry',
	content: {
		'application/json': {
			schema: resolver(error(409, 'Duplicate entry'))
		}
	}
};
