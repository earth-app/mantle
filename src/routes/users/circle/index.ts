import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// User Friends Routes
import addUserCircle from './add';
import removeUserCircle from './remove';

// Implementation
import Bindings from '../../../bindings';
import * as users from '../../../util/routes/users';
import { paginatedParameters } from '../../../util/util';

const userCircle = new Hono<{ Bindings: Bindings }>();

userCircle.get(
	'/',
	describeRoute({
		summary: "Retrieve a user's circle",
		description: "Gets a list of users in the authenticated user's circle.",
		security: [{ BearerAuth: [] }],
		responses: {
			200: {
				description: 'List of users in the circle',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.user))
					}
				}
			},
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found'
			}
		},
		tags: [tags.USERS, tags.USER_FRIENDS]
	}),
	async (c) => {
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

		const res = await users.getUserFromContext(c);
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
		const circleIds = Array.from(user.account.getCircle().asJsReadonlySetView());
		const circle = await Promise.all(
			circleIds
				.filter((_, index) => index + 1 > (page - 1) * limit && index < page * limit)
				.map(async (id) => {
					const circle = await users.getUserById(id, c.env);

					if (circle) {
						return circle.public;
					}
					return null;
				})
		);

		const filteredCircle = circle.filter(Boolean).filter((circle) => !search || circle?.username.includes(search));

		return c.json(
			{
				page: page,
				limit: limit,
				total: filteredCircle.length,
				items: filteredCircle
			},
			200
		);
	}
);

userCircle.route('/add', addUserCircle);
userCircle.route('/remove', removeUserCircle);

export default userCircle;
