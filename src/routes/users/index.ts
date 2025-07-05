import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// User Routes
import loginUser from './login';
import createUser from './create';
import user from './user';

// Implementation
import { bearerAuthMiddleware } from '../../util/authentication';
import { getUsers } from '../../util/routes/users';
import Bindings from '../../bindings';

const users = new Hono<{ Bindings: Bindings }>();

users.get(
	'/',
	describeRoute({
		summary: 'Retrieve a paginated list of all users',
		description: 'Gets a paginated list of all users in the Earth App.',
		parameters: [
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
				description: 'Number of items per page (default: 25, max: 100)',
				required: false,
				schema: {
					type: 'integer',
					minimum: 1,
					maximum: 100,
					default: 25
				}
			},
			{
				name: 'search',
				in: 'query',
				description: 'Search query for usernames (max 40 characters)',
				required: false,
				schema: {
					type: 'string',
					maxLength: 40,
					default: ''
				}
			}
		],
		responses: {
			200: {
				description: 'List of users',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.user))
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.USERS]
	}),
	async (c) => {
		const page = c.req.query('page') ? parseInt(c.req.query('page')!) : 1;
		const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 25;
		const search = c.req.query('search') || '';

		if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
			return c.json(
				{
					code: 400,
					message: 'Invalid pagination parameters'
				},
				400
			);
		}

		if (limit > 100) {
			return c.json(
				{
					code: 400,
					message: 'Limit cannot exceed 100'
				},
				400
			);
		}

		if (search.length > 40) {
			return c.json(
				{
					code: 400,
					message: 'Search query cannot exceed 40 characters'
				},
				400
			);
		}

		const users = (await getUsers(c.env, limit, page - 1, search)).map((user) => user.public);
		return c.json(
			{
				page: page,
				limit: limit,
				total: users.length,
				items: users
			},
			200
		);
	}
);

users.route('/login', loginUser);
users.route('/create', createUser);

users.use('/current', bearerAuthMiddleware());
users.get(
	'/current',
	describeRoute({
		summary: 'Gets the current user',
		description: 'Gets the user based on the provided Bearer token.',
		security: [{ BearerAuth: [] }],
		responses: {
			200: {
				description: 'User retrieved successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.USERS]
	})
);
users.patch(
	'/current',
	describeRoute({
		summary: 'Updates the current user',
		description: 'Updates the user based on the provided Bearer token.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'User object partial',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.userUpdate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'User updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.USERS]
	})
);
users.delete(
	'/current',
	describeRoute({
		summary: 'Deletes the current user',
		description: 'Deletes the user based on the provided Bearer token.',
		security: [{ BearerAuth: [] }],
		responses: {
			204: {
				description: 'User deleted successfully'
			},
			400: schemas.badRequest
		},
		tags: [tags.USERS]
	})
);
users.route('/current', user);

users.get(
	'/:id',
	describeRoute({
		summary: 'Gets a user by ID',
		description: 'Retrieves the user based on the provided User ID.',
		parameters: [
			{
				name: 'id',
				in: 'path',
				required: true,
				schema: {
					type: 'string',
					description: 'Unique identifier for the user',
					example: 'eb9137b1272938'
				}
			}
		],
		responses: {
			200: {
				description: 'User found',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			403: schemas.forbidden,
			404: {
				description: 'User not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'User not found'))
					}
				}
			}
		},
		tags: [tags.USERS]
	})
);
users.patch(
	'/:id',
	describeRoute({
		summary: 'Updates a user by ID',
		description: 'Updates the user based on the provided User ID.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'User object partial',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.userUpdate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'User updated successfully',
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
				description: 'User not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'User not found'))
					}
				}
			}
		},
		tags: [tags.USERS]
	})
);
users.delete(
	'/:id',
	describeRoute({
		summary: 'Deletes a user by ID',
		description: 'Deletes the user based on the provided User ID.',
		security: [{ BearerAuth: [] }],
		responses: {
			204: {
				description: 'User deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'User not found'))
					}
				}
			}
		},
		tags: [tags.USERS]
	})
);
users.route('/:id', user);

users.get(
	'/:username',
	describeRoute({
		summary: 'Gets a user by username',
		description: 'Retrieves the user based on the provided username. The username should begin with "@"',
		parameters: [
			{
				name: 'username',
				in: 'path',
				required: true,
				schema: {
					type: 'string',
					description: 'Username of the user, beginning with "@"',
					example: '@john_doe'
				}
			}
		],
		responses: {
			200: {
				description: 'User found',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			403: schemas.forbidden,
			404: {
				description: 'User not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'User not found'))
					}
				}
			}
		},
		tags: [tags.USERS]
	})
);
users.patch(
	'/:username',
	describeRoute({
		summary: 'Updates a user by username',
		description: 'Updates the user based on the provided username. The username should begin with "@"',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'User object partial',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.userUpdate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'User updated successfully',
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
				description: 'User not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'User not found'))
					}
				}
			}
		},
		tags: [tags.USERS]
	})
);
users.delete(
	'/:username',
	describeRoute({
		summary: 'Deletes a user by username',
		description: 'Deletes the user based on the provided username. The username should begin with "@"',
		security: [{ BearerAuth: [] }],
		responses: {
			204: {
				description: 'User deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'User not found'))
					}
				}
			}
		},
		tags: [tags.USERS]
	})
);
users.route('/:username', user);

export default users;
