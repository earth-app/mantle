import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
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

users.route('/current', user);
users.use('/current', bearerAuthMiddleware());

users.route('/:id', user);

export default users;
