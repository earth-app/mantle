import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import { com } from '@earth-app/ocean';
import Bindings from '../../bindings';
import { getOwnerOfBearer } from '../../util/authentication';
import { getEventById, getEventsByAttendees, updateEvent } from '../../util/routes/events';
import { paginatedParameters } from '../../util/util';

const currentEvent = new Hono<{ Bindings: Bindings }>();

// Get Attending Events
currentEvent.get(
	'/',
	describeRoute({
		summary: 'Retrieve all events that the current user is attending',
		security: [{ BearerAuth: [] }],
		description: 'Gets all events that the current user is attending.',
		parameters: schemas.paginatedParameters,
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
	async (c) => {
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

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

		const events = await getEventsByAttendees([user.account.id], c.env, limit, page - 1, search);
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

// Sign up for New Event
currentEvent.post(
	'/signup',
	describeRoute({
		summary: 'Sign up for a new event',
		security: [{ BearerAuth: [] }],
		description: 'Allows the current user to sign up for a new event.',
		parameters: [
			{
				name: 'eventId',
				in: 'query',
				description: 'ID of the event to sign up for',
				required: true,
				schema: {
					type: 'string',
					maxLength: com.earthapp.util.ID_LENGTH,
					minLength: com.earthapp.util.ID_LENGTH
				}
			}
		],
		responses: {
			200: {
				description: 'Successfully signed up for the event',
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
	async (c) => {
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

		const eventId = c.req.query('eventId');
		if (!eventId) {
			return c.json(
				{
					code: 400,
					message: 'Event ID is required'
				},
				400
			);
		}

		const obj = await getEventById(eventId, c.env);
		if (!obj) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		const event = obj.event;

		if (event.attendees.asJsArrayView().length >= event.getMaxAttendees()) {
			return c.json(
				{
					code: 400,
					message: 'Event is full'
				},
				400
			);
		}

		if (event.hostId == user.account.id || event.isAttendee(user.account)) {
			return c.json(
				{
					code: 400,
					message: 'You are already signed up for this event'
				},
				400
			);
		}

		event.addAttendee(user.account);

		const updatedEvent = await updateEvent(obj, c.env);
		return c.json(updatedEvent.public, 200);
	}
);

// Cancel Event Signup
currentEvent.post(
	'/cancel',
	describeRoute({
		summary: 'Cancel event signup',
		security: [{ BearerAuth: [] }],
		description: 'Allows the current user to cancel their signup for an event.',
		parameters: [
			{
				name: 'eventId',
				in: 'query',
				description: 'ID of the event to cancel signup for',
				required: true,
				schema: resolver(schemas.id)
			}
		],
		responses: {
			200: {
				description: 'Successfully canceled signup for the event',
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
	async (c) => {
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

		const eventId = c.req.query('eventId');
		if (!eventId) {
			return c.json(
				{
					code: 400,
					message: 'Event ID is required'
				},
				400
			);
		}

		const obj = await getEventById(eventId, c.env);
		if (!obj) {
			return c.json(
				{
					code: 404,
					message: 'Event not found'
				},
				404
			);
		}

		const event = obj.event;
		if (event.hostId == user.account.id) {
			return c.json(
				{
					code: 400,
					message: 'You are the host of this event and cannot cancel your signup'
				},
				400
			);
		}

		if (!event.isAttendee(user.account)) {
			return c.json(
				{
					code: 400,
					message: 'You are not signed up for this event'
				},
				400
			);
		}

		event.removeAttendee(user.account);
		const updatedEvent = await updateEvent(obj, c.env);

		return c.json(updatedEvent.public, 200);
	}
);

export default currentEvent;
