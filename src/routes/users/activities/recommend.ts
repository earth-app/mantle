import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// Implementation
import { com, kotlin } from '@earth-app/ocean';
import Bindings from '../../../bindings';
import { toActivity } from '../../../types/activities';
import { bearerAuthMiddleware } from '../../../util/authentication';
import { getRandomActivities } from '../../../util/routes/activities';
import { getAuthenticatedUserFromContext } from '../../../util/routes/users';

const recommendActivities = new Hono<{ Bindings: Bindings }>();

recommendActivities.get(
	'/',
	describeRoute({
		summary: 'Recommend activities for a user',
		description: 'Provides a list of recommended activities based on user preferences and history.',
		parameters: [
			{
				name: 'poolLimit',
				in: 'query',
				description: 'Maximum number of activities to consider for recommendations',
				required: false,
				schema: {
					type: 'integer',
					minimum: 5,
					default: 25,
					maximum: 50,
					description: 'The maximum number of activities to recommend'
				}
			}
		],
		responses: {
			200: {
				description: 'List of recommended activities',
				content: {
					'application/json': {
						schema: resolver(schemas.activities)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden
		},
		tags: [tags.USERS, tags.ACTIVITIES]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const poolLimit = Number(c.req.query('poolLimit') || 25);
		if (isNaN(poolLimit)) {
			return c.json(
				{
					code: 400,
					message: 'Invalid pool limit. Must be a number.'
				},
				400
			);
		}

		if (poolLimit < 5 || poolLimit > 50) {
			return c.json(
				{
					code: 400,
					message: 'Pool limit must be between 5 and 50.'
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

		const pool = (await getRandomActivities(c.env, poolLimit)).reduce(
			(acc, activity) => {
				acc[activity.activity.id] = {
					obj: activity.activity,
					created_at: activity.public.created_at,
					updated_at: activity.public.updated_at
				};
				return acc;
			},
			{} as Record<string, { obj: com.earthapp.activity.Activity; created_at?: Date; updated_at?: Date }>
		);

		const poolList = kotlin.collections.KtList.fromJsArray(Object.values(pool).map((activity) => activity.obj));
		const recommendations = com.earthapp.ocean
			.recommendActivityForAccount(poolList, user.account)
			.asJsReadonlyArrayView()
			.map((activity) => toActivity(activity, pool[activity.id]?.created_at, pool[activity.id]?.updated_at));

		return c.json(recommendations, 200);
	}
);

export default recommendActivities;
