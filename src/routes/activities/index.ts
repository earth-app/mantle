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
		const page = c.req.query('page') ? parseInt(c.req.query('page')!) : 1;
		const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 25;
		const search = c.req.query('search') || '';

		if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
			return c.json(
				{
					code: 400,
					message: 'Invalid pagination parameters'
				},
				400
			);
		}

		if (limit > 100) {
			return c.json(
				{
					code: 400,
					message: 'Limit cannot exceed 100'
				},
				400
			);
		}

		if (search.length > 40) {
			return c.json(
				{
					code: 400,
					message: 'Search query cannot exceed 40 characters'
				},
				400
			);
		}

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
