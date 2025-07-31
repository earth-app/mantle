import { Hono } from 'hono';

import { zValidator } from '@hono/zod-validator';
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
import { getAuthenticatedUserFromContext, updateUser } from '../../../util/routes/users';

const setUserActivities = new Hono<{ Bindings: Bindings }>();

setUserActivities.patch(
	'/',
	zValidator('json', schemas.userActivitiesSet),
	describeRoute({
		summary: 'Set user activities',
		description: 'Sets the activities associated with a user in the Earth App.',
		requestBody: {
			description: 'Activity IDs to set for the user',
			required: true,
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.userActivitiesSet) as OpenAPIV3.SchemaObject
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
		tags: [tags.USERS, tags.ACTIVITIES]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const body = c.req.valid('json');
		const activityIds = body
			.filter(Boolean)
			.filter((id) => body.indexOf(id) === body.lastIndexOf(id)) // Ensure unique IDs
			.map((id) => id.trim())
			.filter((id) => id.length > 0);

		if (activityIds.length === 0) {
			return c.json(
				{
					code: 400,
					message: 'No valid activity IDs provided'
				},
				400
			);
		}

		const res = await getAuthenticatedUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: res.status,
					message: res.message
				},
				res.status
			);
		}

		const user = res.data;

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

		user.account.setActivities(activities.map((activity) => activity?.activity) as com.earthapp.activity.Activity[]);

		await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);
		return c.json(user.public, 200);
	}
);

export default setUserActivities;
