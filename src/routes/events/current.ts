import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { bearerAuthMiddleware, getOwnerOfToken } from '../../util/authentication';
import { getUserFromContext } from '../../util/routes/users';
import { getEventsByAttendees } from '../../util/routes/events';

const currentEvent = new Hono<{ Bindings: Bindings }>();

currentEvent.get(
	'/',
	describeRoute({
		summary: 'Retrieve all events that the current user is attending',
		security: [{ BearerAuth: [] }],
		description: 'Gets all events that the current user is attending.',
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
				description: 'Event details',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.event))
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Event not found'
			}
		},
		tags: [tags.EVENTS]
	}),
	bearerAuthMiddleware(),
	async (c) => {
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
		const user = await getOwnerOfToken(token, c.env);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Invalid token'
				},
				401
			);
		}

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

		const events = await getEventsByAttendees([user.account.id], c.env.DB, limit, page - 1, search);
		return c.json(
			{
				page: page,
				limit: limit,
				total: events.length,
				items: events.map((event) => event.public)
			},
			200
		);
	}
);

export default currentEvent;
