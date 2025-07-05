import { Context, Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { deleteUser, getUserById, getUserByUsername, getUserFromContext, patchUser } from '../../util/routes/users';
import { bearerAuthMiddleware, getOwnerOfToken } from '../../util/authentication';
import { User, UserObject } from '../../types/users';
import { com } from '@earth-app/ocean';
import { ContentfulStatusCode } from 'hono/utils/http-status';

const user = new Hono<{ Bindings: Bindings }>();

// Get User
user.get('/', async (c) => {
	const path = c.req.param('id');
	let user: UserObject | null;

	// Current User
	if (!path) {
		const bearerToken = c.req.header('Authorization');
		if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const token = bearerToken.slice(7);
		user = await getOwnerOfToken(token, c.env);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}
	} else {
		if (path.startsWith('@')) {
			// By Username
			const username = path.slice(1);
			user = await getUserByUsername(username, c.env);
		} else {
			// By ID
			user = await getUserById(path, c.env);
		}
	}

	if (!user) {
		return c.json(
			{
				code: 404,
				message: 'User not found'
			},
			404
		);
	}

	switch (user.account.visibility.name.toLowerCase()) {
		// Unlisted - Requires authentication
		case 'unlisted': {
			if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
				return c.json(
					{
						code: 403,
						message: 'Forbidden: This user is unlisted and requires authentication to view.'
					},
					403
				);
			}
			break;
		}
		// Private - Admin only
		case 'private': {
			if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
				return c.json(
					{
						code: 403,
						message: 'Forbidden: This user is private.'
					},
					403
				);
			}

			const token = c.req.header('Authorization')!.slice(7);
			if (token !== c.env.ADMIN_API_KEY) {
				return c.json(
					{
						code: 403,
						message: 'Forbidden: You do not have permission to view this user.'
					},
					403
				);
			}

			break;
		}
	}

	return c.json(user.public);
});

// Patch User
user.patch('/', bearerAuthMiddleware(), async (c) => {
	const rawBody = await c.req.text();
	if (!rawBody) {
		return c.json(
			{
				code: 400,
				message: 'Request body cannot be empty'
			},
			400
		);
	}

	let data: Partial<com.earthapp.account.Account> = await c.req.json();
	if (!data || typeof data !== 'object') {
		return c.json(
			{
				code: 400,
				message: 'Invalid request body'
			},
			400
		);
	}

	const res = await getUserFromContext(c);
	if (!res.data) {
		return c.json(
			{
				code: res.status,
				message: res.message
			},
			res.status as ContentfulStatusCode
		);
	}

	const user = res.data;

	if (data.type || data.id) {
		data = {
			...data,
			type: undefined, // Prevent type changes
			id: undefined // Prevent ID changes
		};
	}

	// Update user properties
	await patchUser(user.account, data, c.env);
	const returned = (await getUserById(user.account.id, c.env))!.public;

	return c.json(returned, 200);
});

// Delete User
user.delete('/', bearerAuthMiddleware(), async (c) => {
	const res = await getUserFromContext(c);
	if (!res.data) {
		return c.json(
			{
				code: res.status,
				message: res.message
			},
			res.status as ContentfulStatusCode
		);
	}
	const user = res.data;
	await deleteUser(user.account.id, c.env);

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
						schema: zodToJsonSchema(schemas.user) as OpenAPIV3.SchemaObject
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.USERS]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const rawBody = await c.req.text();
		if (!rawBody) {
			return c.json(
				{
					code: 400,
					message: 'Request body cannot be empty'
				},
				400
			);
		}

		let data: Partial<User['account']['visibility']> = await c.req.json();
		if (!data || typeof data !== 'object') {
			return c.json(
				{
					code: 400,
					message: 'Invalid request body'
				},
				400
			);
		}

		const res = await getUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status as ContentfulStatusCode
			);
		}

		const user = res.data;

		// Sanitize Body
		const allowedFields = Object.keys(user.public.account.visibility);

		// Filter data to only include allowed fields
		const sanitizedData: Partial<User['account']['visibility']> = Object.keys(data)
			.filter((key) => allowedFields.includes(key))
			.reduce((obj, key) => {
				obj[key] = (data as any)[key];
				return obj;
			}, {} as any);

		for (const [key, value] of Object.entries(sanitizedData)) {
			if (key === 'account') continue;
			if (key in user.account.visibility) {
				user.account.setFieldPrivacy(key, com.earthapp.account.Privacy.valueOf(value as string));
			} else {
				// In case sanitization failed
				console.warn(`Invalid field: ${key} in user visibility update for ${user.public.username}`);
				return c.json(
					{
						code: 400,
						message: `Invalid field: ${key}`
					},
					400
				);
			}
		}

		await patchUser(
			user.account,
			{ visibility: com.earthapp.Visibility.valueOf(sanitizedData.account ?? user.public.account.visibility.account) },
			c.env
		);
		const updated = (await getUserById(user.account.id, c.env))!.public;

		return c.json(updated, 200);
	}
);

export default user;
