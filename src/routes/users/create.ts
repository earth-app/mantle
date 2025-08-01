import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';
import { validateMiddleware } from '../../util/validation';

import Bindings from '../../bindings';
import { ipRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { globalRateLimit } from '../../util/ratelimit';
import * as users from '../../util/routes/users';

const createUser = new Hono<{ Bindings: Bindings }>();

createUser.post(
	'/',
	// Apply both KV rate limiting and existing Cloudflare rate limiting
	ipRateLimit(rateLimitConfigs.userCreate),
	globalRateLimit(false), // Anonymous rate limiting
	validateMiddleware('json', schemas.userCreate),
	describeRoute({
		summary: 'Create a new user',
		description: 'Creates a new user within the Earth App',
		requestBody: {
			description: 'User object',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.userCreate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			201: {
				description: 'User created successfully',
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
	async (c) => {
		const { username, email, password, firstName, lastName } = c.req.valid('json');

		if (await users.doesUsernameExist(username, c.env))
			return c.json(
				{
					code: 400,
					message: `Username ${username} already exists`
				},
				400
			);

		const emailExists = await users.getUserByEmail(email, c.env);
		if (emailExists)
			return c.json(
				{
					code: 400,
					message: `Email ${email} is already registered`
				},
				400
			);

		const user = await users.createUser(username, (user) => {
			user.email = email;

			if (firstName) user.firstName = firstName;
			if (lastName) user.lastName = lastName;
		});
		if (!user) {
			return c.json(
				{
					code: 500,
					message: 'Failed to create user'
				},
				500
			);
		}

		const result = await users.saveUser(user, password, c.env);
		if (!result)
			return c.json(
				{
					code: 400,
					message: 'Failed to create user'
				},
				400
			);

		return c.json(result.public, 201);
	}
);

export default createUser;
