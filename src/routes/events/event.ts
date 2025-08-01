import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import { com } from '@earth-app/ocean';
import Bindings from '../../bindings';
import { Event } from '../../types/events';
import { bearerAuthMiddleware, checkVisibility, getOwnerOfBearer, getOwnerOfToken } from '../../util/authentication';
import { authRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { globalRateLimit } from '../../util/ratelimit';
import * as events from '../../util/routes/events';

const event = new Hono<{ Bindings: Bindings }>();

// Get Event
event.get(
	'/',
	describeRoute({
		summary: 'Retrieve an event by ID',
		description: 'Gets an event by its ID.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'eventId',
				in: 'path',
				description: 'Event ID',
				required: false,
				schema: {
					type: 'string',
					minLength: com.earthapp.util.ID_LENGTH,
					maxLength: com.earthapp.util.ID_LENGTH
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
			403: schemas.forbidden,
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

		const event = await events.getEventById(id, c.env);
		if (!event) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		// Short circuit visibility check
		const visibility = checkVisibility(event.event.visibility, c);
		if (visibility.success) return c.json(event.public, 200);

		const owner = await getOwnerOfBearer(c);
		const isAllowed =
			(owner && event.event.hostId == owner.account.id) || event.event.attendees.asJsArrayView().includes(owner?.account.id ?? '');

		if (isAllowed) return c.json(event.public, 200);

		// Fallback to fail if visibility check fails
		return c.json(
			{
				code: visibility.code,
				message: visibility.message
			},
			visibility.code
		);
	}
);

// Update Event
event.patch(
	'/',
	authRateLimit(rateLimitConfigs.eventUpdate),
	globalRateLimit(true), // Authenticated rate limiting
	describeRoute({
		summary: 'Update an event',
		description: 'Updates an existing event by its ID.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'eventId',
				in: 'path',
				description: 'Event ID',
				required: true,
				schema: {
					type: 'string',
					minLength: com.earthapp.util.ID_LENGTH,
					maxLength: com.earthapp.util.ID_LENGTH
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
			401: schemas.unauthorized,
			403: schemas.forbidden,
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
	bearerAuthMiddleware(),
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

		const event = await events.getEventById(id, c.env);
		if (!event) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		const token = c.req.header('Authorization')?.slice(7);
		if (!token) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: You must be authenticated to update an event.'
				},
				401
			);
		}

		const owner = await getOwnerOfToken(token, c.env);
		if (token !== c.env.ADMIN_API_KEY && (!owner || owner.account.id !== event.event.hostId)) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to update this event.'
				},
				403
			);
		}

		const updatedEvent = await events.patchEvent(event, data, c.env);
		return c.json(updatedEvent.public, 200);
	}
);
// Delete Event
event.delete(
	'/',
	globalRateLimit(true), // Authenticated rate limiting
	describeRoute({
		summary: 'Delete an event',
		description: 'Deletes an existing event by its ID.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'eventId',
				in: 'path',
				description: 'Event ID',
				required: true,
				schema: {
					type: 'string',
					minLength: com.earthapp.util.ID_LENGTH,
					maxLength: com.earthapp.util.ID_LENGTH
				}
			}
		],
		responses: {
			204: {
				description: 'Event deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
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
	bearerAuthMiddleware(),
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

		const event = await events.getEventById(id, c.env);
		if (!event) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		const token = c.req.header('Authorization')?.slice(7);
		if (!token) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: You must be authenticated to delete an event.'
				},
				401
			);
		}
		const owner = await getOwnerOfToken(token, c.env);
		if (token !== c.env.ADMIN_API_KEY && (!owner || owner.account.id !== event.event.hostId || !owner.account.isAdmin)) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to delete this event.'
				},
				403
			);
		}

		const result = await events.deleteEvent(id, c.env);
		if (!result) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		return c.body(null, 204);
	}
);

export default event;
