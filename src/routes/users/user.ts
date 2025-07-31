import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// User Routes
import userActivities from './activities';
import userCircle from './circle';
import userFriends from './friends';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../bindings';
import { adminMiddleware, bearerAuthMiddleware, checkVisibility } from '../../util/authentication';
import { authRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { globalRateLimit } from '../../util/ratelimit';
import * as users from '../../util/routes/users';

const user = new Hono<{ Bindings: Bindings }>();

// Get User
user.get('/', async (c) => {
	const res = await users.getUserFromContext(c);
	if (!res.data) {
		return c.json(
			{
				code: res.status,
				message: res.message
			},
			res.status
		);
	}
	const user = res.data;

	const visibility = checkVisibility(user.account.visibility, c);
	if (!visibility.success) {
		return c.json(
			{
				code: visibility.code,
				message: visibility.message
			},
			visibility.code
		);
	}

	return c.json(user.public);
});

// Patch User
user.patch(
	'/',
	authRateLimit(rateLimitConfigs.userUpdate),
	globalRateLimit(true), // Authenticated rate limiting
	bearerAuthMiddleware(),
	zValidator('json', schemas.userUpdate),
	async (c) => {
		let data = c.req.valid('json');

		const res = await users.getAuthenticatedUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		const user = res.data;

		// Update user properties
		const returned = await users.patchUser(user.account, c.env, data);
		return c.json(returned, 200);
	}
);

// Delete User
user.delete('/', bearerAuthMiddleware(), async (c) => {
	const res = await users.getAuthenticatedUserFromContext(c);
	if (!res.data) {
		return c.json(
			{
				code: res.status,
				message: res.message
			},
			res.status
		);
	}
	const user = res.data;

	const result = await users.deleteUser(user.account.id, c.env);
	if (!result) {
		return c.json(
			{
				code: 404,
				message: 'User not found'
			},
			404
		);
	}

	return c.body(null, 204);
});

// Change Field Privacy
user.patch(
	'/field_privacy',
	describeRoute({
		summary: 'Change Field Privacy',
		description: 'Change the visibility of account fields in the user account.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'Field privacy object',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.userFieldPrivacy) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'User visibility updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.USERS]
	}),
	authRateLimit(rateLimitConfigs.userUpdate),
	globalRateLimit(true), // Authenticated rate limiting
	bearerAuthMiddleware(),
	zValidator('json', schemas.userFieldPrivacy),
	async (c) => {
		const data = c.req.valid('json');

		const res = await users.getAuthenticatedUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		const user = res.data;
		try {
			for (const [key, value] of Object.entries(data)) {
				const privacy = com.earthapp.account.Privacy.valueOf(value.toUpperCase());
				user.account.setFieldPrivacy(key, privacy);
			}
		} catch (error) {
			return c.json(
				{
					code: 400,
					message: `Failed to update field privacy: ${error instanceof Error ? error.message : 'Unknown error'}`
				},
				400
			);
		}

		const updated = await users.patchUser(user.account, c.env);
		return c.json(updated, 200);
	}
);

// Get Profile Photo
user.get(
	'/profile_photo',
	describeRoute({
		summary: "Get a user's Profile Photo",
		description: 'Returns the profile photo for the user.',
		security: [{ BearerAuth: [] }],
		responses: {
			200: {
				description: 'Profile photo',
				content: {
					'image/jpeg': {}
				}
			},
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found'
			}
		},
		tags: [tags.USERS]
	}),
	async (c) => {
		const res = await users.getUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		const user = res.data;
		const profile = await users.getProfilePhoto(user.public, c.env);

		c.res.headers.set('Content-Type', 'image/jpeg');
		c.res.headers.set('Content-Disposition', 'inline; filename="profile.jpg"');

		return c.body(profile, 200);
	}
);

// Regenerate Profile Photo
user.put(
	'/profile_photo',
	describeRoute({
		summary: "Regenerate a user's Profile Photo",
		description: 'Regenerates the profile photo for the user.',
		security: [{ BearerAuth: [] }],
		responses: {
			201: {
				description: 'Profile photo regenerated successfully',
				content: {
					'image/jpeg': {}
				}
			},
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found'
			}
		},
		tags: [tags.USERS]
	}),
	authRateLimit(rateLimitConfigs.userUpdate),
	globalRateLimit(true), // Authenticated rate limiting
	bearerAuthMiddleware(),
	async (c) => {
		const res = await users.getAuthenticatedUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		const user = res.data;
		const profile = await users.newProfilePhoto(user.public, c.env);

		c.res.headers.set('Content-Type', 'image/jpeg');
		c.res.headers.set('Content-Disposition', 'inline; filename="profile.jpg"');

		return c.body(profile, 201);
	}
);

// Set Account Type
user.put(
	'/account_type',
	describeRoute({
		summary: 'Set Account Type [Admin Only]',
		description: 'Sets the account type for the user. This is an admin-only operation.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'account_type',
				in: 'query',
				required: true,
				schema: {
					type: 'string',
					enum: com.earthapp.account.AccountType.values().map((type) => type.name.toLowerCase())
				}
			}
		],
		responses: {
			200: {
				description: 'Account type set successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found'
			}
		},
		tags: [tags.USERS]
	}),
	authRateLimit(rateLimitConfigs.userUpdate),
	globalRateLimit(true), // Authenticated rate limiting
	adminMiddleware(),
	async (c) => {
		const accountType = c.req.query('account_type')?.toUpperCase();
		if (!accountType) {
			return c.json(
				{
					code: 400,
					message: 'Account type is required'
				},
				400
			);
		}

		const type = com.earthapp.account.AccountType.values().find((t) => t.name === accountType);
		if (!type) {
			return c.json(
				{
					code: 400,
					message: `Invalid account type: ${accountType}`
				},
				400
			);
		}

		const res = await users.getAuthenticatedUserFromContext(c);
		if (res.status !== 200) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		if (!res.data) {
			return c.json(
				{
					code: 404,
					message: 'User not found'
				},
				404
			);
		}

		const user = res.data;
		user.account.type = type;
		const updated = await users.updateUser(user, com.earthapp.account.Privacy.PRIVATE, c.env);
		return c.json(updated.public, 200);
	}
);

user.route('/activities', userActivities);
user.route('/friends', userFriends);
user.route('/circle', userCircle);

export default user;
