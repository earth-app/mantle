import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../../bindings';
import { bearerAuthMiddleware } from '../../../util/authentication';
import { getActivityById } from '../../../util/routes/activities';
import { getUserFromContext, updateUser } from '../../../util/routes/users';

const setUserActivities = new Hono<{ Bindings: Bindings }>();

setUserActivities.patch(
	'/',
	describeRoute({
		summary: 'Set user activities',
		description: 'Sets the activities associated with a user in the Earth App.',
		requestBody: {
			description: 'Activity IDs to set for the user',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.idArray) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'Activities updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User or Activity not found'
			}
		},
		tags: [tags.USERS]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const rawBody = await c.req.text();
		if (!rawBody) {
			return c.json(
				{
					code: 400,
					message: 'Request body cannot be empty'
				},
				400
			);
		}

		const activityIds: string[] = await c.req.json();
		if (!Array.isArray(activityIds) || activityIds.length === 0) {
			return c.json(
				{
					code: 400,
					message: 'Activities must be a non-empty array'
				},
				400
			);
		}

		const activities = await Promise.all(activityIds.map(async (id) => await getActivityById(id, c.env.DB)));
		if (activities.some((activity) => !activity)) {
			return c.json(
				{
					code: 404,
					message: 'One or more activities not found'
				},
				404
			);
		}

		const res = await getUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		try {
			const user = res.data;
			user.account.setActivities(activities.map((activity) => activity?.activity) as com.earthapp.activity.Activity[]);

			await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);
			return c.json(user.public, 200);
		} catch (error) {
			return c.json(
				{
					code: 500,
					message: `Failed to set activities: ${error instanceof Error ? error.message : 'Unknown error'}`
				},
				500
			);
		}
	}
);

export default setUserActivities;
