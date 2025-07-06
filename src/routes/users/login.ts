import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { basicAuthMiddleware } from '../../util/authentication';
import { loginUser } from '../../util/routes/users';
import { getCredentials } from '../../util/util';

const login = new Hono<{ Bindings: Bindings }>();

login.use(basicAuthMiddleware());
login.post(
	'/',
	describeRoute({
		summary: 'Login a user',
		description: 'Logs in a user and returns an authentication token.',
		security: [{ BasicAuth: [] }],
		responses: {
			200: {
				description: 'Login successful',
				content: {
					'application/json': {
						schema: resolver(schemas.loginResponse)
					}
				}
			},
			401: schemas.unauthorized
		},
		tags: [tags.USERS]
	}),
	async (c) => {
		const authorization = c.req.header('Authorization');
		if (!authorization || !authorization.startsWith('Basic ')) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const username = getCredentials(authorization)[0];
		if (!username) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const res = await loginUser(username, c.env);
		if (!res) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		return c.json(res);
	}
);

export default login;
