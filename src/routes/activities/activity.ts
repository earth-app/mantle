import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';
import { validateMiddleware } from '../../util/validation';

import Bindings from '../../bindings';
import { Activity } from '../../types/activities';
import { adminMiddleware } from '../../util/authentication';
import * as activities from '../../util/routes/activities';

const activity = new Hono<{ Bindings: Bindings }>();

// Get Activity
activity.get(
	'/',
	describeRoute({
		summary: 'Retrieve an activity by ID',
		description: 'Gets details of a specific activity in the Earth App.',
		parameters: [
			{
				name: 'activityId',
				in: 'path',
				description: 'ID of the activity to retrieve',
				required: true,
				schema: {
					type: 'string',
					example: 'coding',
					description: 'The unique identifier of the activity to update',
					minLength: 3
				}
			},
			{
				name: 'includeAliases',
				in: 'query',
				description: 'Whether to search for aliases as well',
				required: false,
				schema: {
					type: 'boolean',
					default: false,
					description: 'If true, will search for aliases in addition to the activity ID'
				}
			}
		],
		responses: {
			200: {
				description: 'Activity details',
				content: {
					'application/json': {
						schema: resolver(schemas.activity)
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Activity not found'
			}
		},
		tags: [tags.ACTIVITIES]
	}),
	async (c) => {
		const id = c.req.param('activityId')?.trim().toLowerCase();
		if (!id) {
			return c.json(
				{
					code: 400,
					message: 'Activity ID is required'
				},
				400
			);
		}

		const includeAliases = c.req.query('includeAliases')?.toLowerCase() === 'true';

		let activity = await activities.getActivityById(id, c.env);
		if (!activity) {
			if (includeAliases) {
				activity = await activities.getActivityByAlias(id, c.env);
			}
		}

		if (!activity) {
			return c.json(
				{
					code: 404,
					message: `Activity with ID ${id} not found`
				},
				404
			);
		}

		return c.json(activity.public, 200);
	}
);

// Patch Activity
activity.patch(
	'/',
	validateMiddleware('json', schemas.activityUpdate),
	describeRoute({
		summary: 'Update an activity by ID [Admin Only]',
		description: 'Updates the details of a specific activity in the Earth App. This route is restricted to admin users.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'activityId',
				in: 'path',
				description: 'ID of the activity to update',
				required: true,
				schema: {
					type: 'string',
					example: 'coding',
					description: 'The unique identifier of the activity to update',
					minLength: 3
				}
			}
		],
		requestBody: {
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.activityUpdate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'Activity updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.activity)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			404: {
				description: 'Activity not found',
				content: {
					'application/json': {
						schema: resolver(schemas.error(404, 'Activity not found'))
					}
				}
			}
		},
		tags: [tags.ACTIVITIES]
	}),
	adminMiddleware(),
	async (c) => {
		const id = c.req.param('activityId');
		if (!id) {
			return c.json(
				{
					code: 400,
					message: 'Activity ID is required'
				},
				400
			);
		}

		const data: Partial<Activity> = c.req.valid('json');

		const activity = await activities.getActivityById(id, c.env);
		if (!activity) {
			return c.json(
				{
					code: 404,
					message: `Activity with ID ${id} not found`
				},
				404
			);
		}

		const updatedActivity = await activities.patchActivity(
			activity,
			{
				...data,
				types: data.types?.map((type) => type as any)
			},
			c.env
		);
		if (!updatedActivity) {
			return c.json(
				{
					code: 400,
					message: `Failed to update activity with ID ${id}`
				},
				400
			);
		}

		return c.json(updatedActivity.public, 200);
	}
);

// Delete Activity
activity.delete(
	'/',
	describeRoute({
		summary: 'Delete an activity by ID [Admin Only]',
		description: 'Deletes a specific activity in the Earth App. This route is restricted to admin users.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'activityId',
				in: 'path',
				description: 'ID of the activity to delete',
				required: true,
				schema: schemas.idParam
			}
		],
		responses: {
			204: {
				description: 'Activity deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			404: {
				description: 'Activity not found'
			}
		},
		tags: [tags.ACTIVITIES]
	}),
	adminMiddleware(),
	async (c) => {
		const id = c.req.param('activityId');
		if (!id) {
			return c.json(
				{
					code: 400,
					message: 'Activity ID is required'
				},
				400
			);
		}

		const result = await activities.deleteActivity(id, c.env);
		if (!result) {
			return c.json(
				{
					code: 404,
					message: `Activity with ID ${id} not found`
				},
				404
			);
		}

		return c.body(null, 204);
	}
);

export default activity;
