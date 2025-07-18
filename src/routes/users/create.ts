import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { kvRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { rateLimit } from '../../util/ratelimit';
import * as users from '../../util/routes/users';

const createUser = new Hono<{ Bindings: Bindings }>();

createUser.post(
	'/',
	// Apply both KV rate limiting and existing Cloudflare rate limiting
	kvRateLimit(rateLimitConfigs.userCreate),
	rateLimit(false), // Anonymous rate limiting
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
		const req = await c.req.json();
		const { username, email, password } = req;

		if (!username || !email || !password)
			return c.json(
				{
					code: 400,
					message: 'Missing required fields'
				},
				400
			);

		try {
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

				if (req.firstName) user.firstName = req.firstName;

				if (req.lastName) user.lastName = req.lastName;
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
		} catch (error) {
			return c.json(
				{
					code: 500,
					message: `Failed to create user: ${error}`
				},
				500
			);
		}
	}
);

export default createUser;
