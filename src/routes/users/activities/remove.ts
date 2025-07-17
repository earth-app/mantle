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
import { getUserFromContext, updateUser } from '../../../util/routes/users';

const removeUserActivity = new Hono<{ Bindings: Bindings }>();

removeUserActivity.delete(
	'/',
	describeRoute({
		summary: 'Remove an activity from a user',
		description: 'Disassociates an activity from a user in the Earth App.',
		parameters: [
			{
				name: 'activityId',
				in: 'query',
				description: 'ID of the activity to remove',
				required: true,
				schema: resolver(schemas.id)
			}
		],
		responses: {
			200: {
				description: 'Activity removed successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'User or Activity not found'
			}
		},
		tags: [tags.USERS]
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

		const res = await getUserFromContext(c);
		if (!res.data) {
			return c.json(
				{
					code: 404,
					message: 'User not found'
				},
				404
			);
		}

		const activity = await getActivityById(activityId, c.env.DB);
		if (!activity) {
			return c.json(
				{
					code: 404,
					message: 'Activity not found'
				},
				404
			);
		}

		try {
			const user = res.data;
			user.account.removeActivityById(activityId);

			await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);
			return c.json(user, 200);
		} catch (error) {
			return c.json(
				{
					code: 500,
					message: `Failed to remove activity: ${error}`
				},
				500
			);
		}
	}
);

export default removeUserActivity;
