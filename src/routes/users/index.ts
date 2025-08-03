import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// User Routes
import createUser from './create';
import loginUser from './login';
import user from './user';

// Implementation
import Bindings from '../../bindings';
import { bearerAuthMiddleware } from '../../util/authentication';
import { getUsers, getUsersCount } from '../../util/routes/users';
import { paginatedParameters } from '../../util/util';

const users = new Hono<{ Bindings: Bindings }>();

users.get(
	'/',
	describeRoute({
		summary: 'Retrieve a paginated list of all users',
		description: 'Gets a paginated list of all users in the Earth App.',
		parameters: schemas.paginatedParameters,
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
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

		const users = (await getUsers(c.env, limit, page - 1, search)).map((user) => user.public);
		return c.json(
			{
				page: page,
				limit: limit,
				total: await getUsersCount(c.env, search),
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
				description: 'User ID',
				in: 'path',
				required: true,
				schema: schemas.idParam
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
		parameters: [
			{
				name: 'id',
				in: 'path',
				description: 'User ID',
				required: true,
				schema: schemas.idParam
			}
		],
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
		parameters: [
			{
				name: 'id',
				in: 'path',
				description: 'User ID',
				required: true,
				schema: schemas.idParam
			}
		],
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
				description: 'Username of the user to retrieve',
				in: 'path',
				required: true,
				schema: schemas.usernameParam
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
		parameters: [
			{
				name: 'username',
				description: 'Username of the user to update',
				in: 'path',
				required: true,
				schema: schemas.usernameParam
			}
		],
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
		parameters: [
			{
				name: 'username',
				description: 'Username of the user to delete',
				in: 'path',
				required: true,
				schema: schemas.usernameParam
			}
		],
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
