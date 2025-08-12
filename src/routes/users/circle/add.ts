import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../../bindings';
import { getAuthenticatedUserFromContext, getUserById, updateUser } from '../../../util/routes/users';

const addUserCircle = new Hono<{ Bindings: Bindings }>();

addUserCircle.put(
	'/',
	describeRoute({
		summary: "Add a user to the authenticated user's circle",
		description: "Adds a user to the authenticated user's circle.",
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'userId',
				in: 'query',
				description: 'ID of the user to add to the circle',
				required: true,
				schema: schemas.idParam
			}
		],
		responses: {
			200: {
				description: 'User added to circle successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.user)
					}
				}
			},
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'User not found'
			},
			409: schemas.duplicate
		},
		tags: [tags.USERS, tags.USER_FRIENDS]
	}),
	async (c) => {
		const userId = c.req.query('userId');
		if (!userId || userId.length !== com.earthapp.util.ID_LENGTH) {
			return c.json(
				{
					code: 400,
					message: 'Valid User ID is required'
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
		const circleUser = await getUserById(userId, c.env);
		if (!circleUser) {
			return c.json(
				{
					code: 404,
					message: 'User not found'
				},
				404
			);
		}

		if (!user.account.isMutualFriend(circleUser.account)) {
			return c.json(
				{
					code: 403,
					message: `User ${circleUser.public.username} is not a mutual friend`
				},
				403
			);
		}

		if (user.account.getCircle().asJsReadonlySetView().has(circleUser.account.id)) {
			return c.json(
				{
					code: 409,
					message: `User ${circleUser.public.username} is already in the circle`
				},
				409
			);
		}

		if (user.account.id === circleUser.account.id) {
			return c.json(
				{
					code: 400,
					message: 'Cannot add yourself to your own circle'
				},
				400
			);
		}

		user.account.addAccountToCircle(circleUser.account);
		await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);

		return c.json(user.public, 200);
	}
);

export default addUserCircle;
