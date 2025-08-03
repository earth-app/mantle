import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// Activity Routes
import activity from './activity';
import createActivity from './create';

// Implementation
import Bindings from '../../bindings';
import { getActivities, getActivitiesCount } from '../../util/routes/activities';
import { paginatedParameters } from '../../util/util';

const activities = new Hono<{ Bindings: Bindings }>();

activities.get(
	'/',
	describeRoute({
		summary: 'Retrieve a paginated list of activities',
		description: 'Gets a list of activities in the Earth App.',
		parameters: schemas.paginatedParameters,
		responses: {
			200: {
				description: 'List of activities',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.activity))
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.ACTIVITIES]
	}),
	async (c) => {
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

		const activities = await getActivities(c.env, limit, page - 1, search);
		return c.json(
			{
				page: page,
				limit: limit,
				total: await getActivitiesCount(c.env, search),
				items: activities.map((activity) => activity.public)
			},
			200
		);
	}
);

activities.route('/create', createActivity);
activities.route('/:activityId', activity);

export default activities;
