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
import { adminMiddleware } from '../../util/authentication';
import { getActivities } from '../../util/routes/activities';
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

		const activites = await getActivities(c.env.DB, limit, page - 1, search);
		return c.json(
			{
				page: page,
				limit: limit,
				total: activites.length,
				items: activites.map((activity) => activity.public)
			},
			200
		);
	}
);

activities.use('/create', adminMiddleware());
activities.route('/create', createActivity);

activities.route('/:activity_id', activity);

export default activities;
