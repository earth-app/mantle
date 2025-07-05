import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import { getEventById } from '../../util/routes/events';
import { Event } from '../../types/events';

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

// Update Event
event.patch(
	'/',
	describeRoute({
		summary: 'Update an event',
		description: 'Updates an existing event by its ID.',
		parameters: [
			{
				name: 'eventId',
				in: 'path',
				description: 'Event ID',
				required: true,
				schema: {
					type: 'string',
					maxLength: 100
				}
			}
		],
		requestBody: {
			description: 'Event data to update',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.eventUpdate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'Event updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.event)
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Event not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'Event not found'))
					}
				}
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

		const data = await c.req.json<Partial<Event>>();
		if (!data || typeof data !== 'object') {
			return c.json(
				{
					code: 400,
					message: 'Invalid request body'
				},
				400
			);
		}

		if (data.id || data.hostId) {
			data.id = undefined; // Prevent updating ID
			data.hostId = undefined; // Prevent updating host ID
		}

		const updatedEvent = await getEventById(id, c.env.DB);
		if (!updatedEvent) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		// TODO Implement actual update logic

		return c.json(updatedEvent.public, 200);
	}
);

export default event;
