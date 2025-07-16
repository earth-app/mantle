import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import { com } from '@earth-app/ocean';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import Bindings from '../../bindings';
import { User, UserObject } from '../../types/users';
import { bearerAuthMiddleware, checkVisibility, getOwnerOfBearer } from '../../util/authentication';
import { deleteUser, getUserById, getUserByUsername, getUserFromContext, patchUser } from '../../util/routes/users';

const user = new Hono<{ Bindings: Bindings }>();

// Get User
user.get('/', async (c) => {
	const path = c.req.param('id');
	let user: UserObject | null;

	// Current User
	if (!path) {
		user = await getOwnerOfBearer(c);
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

	let data: DeepPartial<User['account']> = await c.req.json();
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
	const returned = await patchUser(user.account, c.env, data);
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

	try {
		const result = await deleteUser(user.account.id, c.env);
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
	} catch (error) {
		return c.json(
			{
				code: 500,
				message: `Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`
			},
			500
		);
	}
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

		let data: Partial<User['account']['field_privacy']> = await c.req.json();
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

		const updated = await patchUser(user.account, c.env);
		return c.json(updated, 200);
	}
);

export default user;
