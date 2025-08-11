import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';
import { validateMiddleware } from '../../util/validation';

import { com } from '@earth-app/ocean';
import Bindings from '../../bindings';
import { getOwnerOfBearer } from '../../util/authentication';
import { authRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import * as events from '../../util/routes/events';

const createEvent = new Hono<{ Bindings: Bindings }>();

createEvent.post(
	'/',
	authRateLimit(rateLimitConfigs.eventCreate),
	validateMiddleware('json', schemas.eventCreate),
	describeRoute({
		summary: 'Create a new event',
		description: 'Creates a new event within the Earth App',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'Event object',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.eventCreate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			201: {
				description: 'Event created successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.event)
					}
				}
			},
			401: schemas.unauthorized,
			400: schemas.badRequest
		},
		tags: [tags.EVENTS]
	}),
	async (c) => {
		const { name, description, type, location, date, end_date, visibility } = c.req.valid('json');

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const event = events.createEvent(owner.account.id, (event) => {
			event.name = name;
			event.description = description || '';
			event.type = com.earthapp.event.EventType.valueOf(type);
			if (location) {
				event.location = new com.earthapp.event.Location(location.latitude, location.longitude);
			}
			event.date = date;
			event.endDate = end_date || date;
			event.visibility = com.earthapp.Visibility.valueOf(visibility);
		});
		if (!event) {
			return c.json(
				{
					code: 500,
					message: 'Failed to create event'
				},
				500
			);
		}

		const obj = await events.saveEvent(event, c.env);
		return c.json(obj.public, 201);
	}
);

export default createEvent;
