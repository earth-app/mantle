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
import { adminMiddleware } from '../../util/authentication';
import * as activities from '../../util/routes/activities';

const createActivity = new Hono<{ Bindings: Bindings }>();

createActivity.post(
	'/',
	validateMiddleware('json', schemas.activityCreate),
	describeRoute({
		summary: 'Create a new activity [Admin Only]',
		description: 'Creates a new activity within the Earth App. Reserved for administrators.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'Activity object',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.activityCreate) as OpenAPIV3.SchemaObject
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
	adminMiddleware(),
	async (c) => {
		const { id, name, description, types, aliases, fields } = c.req.valid('json');

		if (!Array.isArray(types) || types.some((type) => typeof type !== 'string')) {
			return c.json(
				{
					code: 400,
					message: 'Types must be an array of strings'
				},
				400
			);
		}

		if (fields && (typeof fields !== 'object' || Array.isArray(fields))) {
			return c.json(
				{
					code: 400,
					message: 'Fields must be an object'
				},
				400
			);
		}

		if (Object.values(fields || {}).some((value) => typeof value !== 'string')) {
			return c.json(
				{
					code: 400,
					message: 'All field values must be strings'
				},
				400
			);
		}

		if (await activities.doesActivityExist(id, c.env)) {
			console.warn(`Activity with ID ${id} already exists`);
			return c.json(
				{
					code: 400,
					message: `Activity with ID ${id} already exists`
				},
				400
			);
		}

		const activity = activities.createActivity(id, name, (activity) => {
			if (description) activity.description = description;
			activity.addTypes(types.map((type) => com.earthapp.activity.ActivityType.valueOf(type)));

			if (aliases) {
				activity.addAliases(aliases);
			}

			if (fields) {
				for (const [key, value] of Object.entries<string>(fields)) {
					activity.setField(key, value);
				}
			}
		});

		const obj = await activities.saveActivity(activity, c.env);
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
	}
);

export default createActivity;
