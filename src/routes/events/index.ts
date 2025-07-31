import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// Event Routes
import createEvent from './create';
import currentEvent from './current';
import event from './event';

// Implementation
import Bindings from '../../bindings';
import { getEvents } from '../../util/routes/events';
import { paginatedParameters } from '../../util/util';

const events = new Hono<{ Bindings: Bindings }>();

events.get(
	'/',
	describeRoute({
		summary: 'Retrieve a paginated list of all events',
		description: 'Gets a paginated list of all events in the Earth App.',
		parameters: schemas.paginatedParameters,
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
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

		const events = await getEvents(c.env, limit, page - 1, search);
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

events.route('/create', createEvent);
events.route('/:eventId', event);
events.route('/current', currentEvent);

export default events;
