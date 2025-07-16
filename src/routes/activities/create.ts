import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

import Bindings from '../../bindings';
import * as activities from '../../util/routes/activities';

const createActivity = new Hono<{ Bindings: Bindings }>();

createActivity.post(
	'/',
	describeRoute({
		summary: 'Create a new activity [Admin Only]',
		description: 'Creates a new activity within the Earth App. Reserved for administrators.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'Activity object',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.activity) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			201: {
				description: 'Activity created successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.activity)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized
		},
		tags: [tags.ACTIVITIES]
	}),
	async (c) => {
		const { id, name, description, types } = await c.req.json();
		if (!id || !name || !types) {
			return c.json(
				{
					code: 400,
					message: 'Missing required fields: id, name, types'
				},
				400
			);
		}

		try {
			if (await activities.doesActivityExist(id, c.env.DB)) {
				return c.json(
					{
						code: 400,
						message: `Activity with ID ${id} already exists`
					},
					400
				);
			}

			const activity = activities.createActivity(id, name, (activity) => {
				activity.description = description;
				activity.types.asJsArrayView().push(...types);
			});

			const obj = await activities.saveActivity(activity, c.env.DB);
			if (!obj) {
				return c.json(
					{
						code: 500,
						message: 'Failed to create activity'
					},
					500
				);
			}

			return c.json(obj.public, 201);
		} catch (error) {
			return c.json(
				{
					code: 500,
					message: `Failed to create activity: ${error}`
				},
				500
			);
		}
	}
);

export default createActivity;
