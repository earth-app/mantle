import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../../bindings';
import { bearerAuthMiddleware } from '../../../util/authentication';
import { getActivityById } from '../../../util/routes/activities';
import { getAuthenticatedUserFromContext, updateUser } from '../../../util/routes/users';

const addUserActivity = new Hono<{ Bindings: Bindings }>();

addUserActivity.put(
	'/',
	describeRoute({
		summary: 'Add an activity to a user',
		description: 'Associates an activity with a user in the Earth App.',
		parameters: [
			{
				name: 'activityId',
				in: 'query',
				description: 'ID of the activity to add',
				required: true,
				schema: resolver(schemas.id)
			}
		],
		responses: {
			200: {
				description: 'Activity added successfully',
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
			},
			409: schemas.duplicate
		},
		tags: [tags.USERS, tags.ACTIVITIES]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const activityId = c.req.query('activityId');
		if (!activityId || activityId.length !== com.earthapp.util.ID_LENGTH) {
			return c.json(
				{
					code: 400,
					message: 'Activity ID is required'
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

		const activity = await getActivityById(activityId, c.env);
		if (!activity) {
			return c.json(
				{
					code: 404,
					message: `Activity with ID ${activityId} not found`
				},
				404
			);
		}

		const user = res.data;
		if (user.account.activities.asJsArrayView().some((a) => a.id === activityId)) {
			return c.json(
				{
					code: 409,
					message: `Activity with ID ${activityId} is already associated with user ${user.public.username}`
				},
				409
			);
		}

		user.account.addActivity(activity.activity);

		await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);
		return c.json(user.public, 200);
	}
);

export default addUserActivity;
