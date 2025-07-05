import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// Event Routes
import createEvent from './create';
import event from './event';
import currentEvent from './current';

// Implementation
import Bindings from '../../bindings';
import { getEvents } from '../../util/routes/events';
import { bearerAuthMiddleware } from '../../util/authentication';

const events = new Hono<{ Bindings: Bindings }>();

events.get(
	'/',
	describeRoute({
		summary: 'Retrieve a paginated list of all events',
		description: 'Gets a paginated list of all events in the Earth App.',
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
				description: 'Search query for event names (max 40 characters)',
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
				description: 'List of events',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.event))
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.EVENTS]
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

		const events = await getEvents(c.env.DB, limit, page - 1);
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

events.use('/create', bearerAuthMiddleware());
events.route('/create', createEvent);

events.route('/:eventId', event);

events.use('/current', bearerAuthMiddleware());
events.route('/current', currentEvent);

export default events;
