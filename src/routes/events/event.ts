import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { getEventById } from '../../util/routes/events';

const event = new Hono<{ Bindings: Bindings }>();

// Get Event
event.get(
	'/',
	describeRoute({
		summary: 'Retrieve an event by ID',
		description: 'Gets an event by its ID.',
		parameters: [
			{
				name: 'eventId',
				in: 'path',
				description: 'Event ID',
				required: false,
				schema: {
					type: 'string',
					maxLength: 100,
					default: ''
				}
			}
		],
		responses: {
			200: {
				description: 'Event details',
				content: {
					'application/json': {
						schema: resolver(schemas.event)
					}
				}
			},
			404: {
				description: 'Event not found'
			}
		},
		tags: [tags.EVENTS]
	}),
	async (c) => {
		const id = c.req.param('eventId');
		if (!id) {
			return c.json(
				{
					code: 400,
					message: 'Event ID is required'
				},
				400
			);
		}

		const event = await getEventById(id, c.env.DB);
		if (!event) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		return c.json(event.public, 200);
	}
);

export default event;
