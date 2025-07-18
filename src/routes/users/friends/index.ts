import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// User Friends Routes
import addUserFriend from './add';
import removeUserFriend from './remove';

// Implementation
import Bindings from '../../../bindings';
import { bearerAuthMiddleware } from '../../../util/authentication';
import { getUserById, getUserFromContext } from '../../../util/routes/users';
import { paginatedParameters } from '../../../util/util';

const userFriends = new Hono<{ Bindings: Bindings }>();

userFriends.get(
	'/',
	describeRoute({
		summary: "Retrieve a user's friends",
		description: 'Gets a list of friends for the authenticated user.',
		security: [{ BearerAuth: [] }],
		responses: {
			200: {
				description: 'List of friends',
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
		tags: [tags.USERS]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

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

		const user = res.data;
		const friendIds = Array.from(user.account.getFriendIds().asJsReadonlySetView());
		const friends = await Promise.all(
			friendIds
				.filter((_, index) => index + 1 > (page - 1) * limit && index < page * limit)
				.map(async (id) => {
					const friend = await getUserById(id, c.env);

					if (friend) {
						return friend.public;
					}
					return null;
				})
		);

		const filteredFriends = friends.filter(Boolean).filter((friend) => !search || friend?.username.includes(search));

		return c.json(
			{
				page: page,
				limit: limit,
				total: filteredFriends.length,
				items: filteredFriends
			},
			200
		);
	}
);

userFriends.route('/add', addUserFriend);
userFriends.route('/remove', removeUserFriend);

export default userFriends;
