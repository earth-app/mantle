import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { getOwnerOfBearer, removeSession } from '../../util/authentication';
import { globalRateLimit } from '../../util/ratelimit';

const logout = new Hono<{ Bindings: Bindings }>();

logout.post(
	'/',
	globalRateLimit(false),
	describeRoute({
		summary: 'Logout a user',
		description: 'Logs out a user and invalidates the authentication token.',
		security: [{ BearerAuth: [] }],
		responses: {
			200: {
				description: 'Logout successful',
				content: {
					'application/json': {
						schema: resolver(schemas.logoutResponse)
					}
				}
			},
			401: schemas.unauthorized
		},
		tags: [tags.USERS]
	}),
	async (c) => {
		const session = c.req.header('Authorization')?.split(' ')[1];
		if (!session) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const user = await getOwnerOfBearer(c);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		// Invalidate the session
		await removeSession(session, c.env);
		return c.json({ message: 'Logout successful', session, user: user.public }, 200);
	}
);

export default logout;
