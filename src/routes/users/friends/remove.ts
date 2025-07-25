import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../../bindings';
import { bearerAuthMiddleware } from '../../../util/authentication';
import { getUserById, getUserFromContext, updateUser } from '../../../util/routes/users';

const removeUserFriend = new Hono<{ Bindings: Bindings }>();

removeUserFriend.delete(
	'/',
	describeRoute({
		summary: 'Remove a friend from the authenticated user',
		description: "Removes a user from the authenticated user's friends list.",
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'friendId',
				in: 'query',
				description: 'ID of the user to remove from friends',
				required: true,
				schema: schemas.idParam
			}
		],
		responses: {
			200: {
				description: 'Friend removed successfully',
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
			}
		},
		tags: [tags.USERS]
	}),
	bearerAuthMiddleware(),
	async (c) => {
		const friendId = c.req.query('friendId');
		if (!friendId || friendId.length !== com.earthapp.util.ID_LENGTH) {
			return c.json(
				{
					code: 400,
					message: 'Valid Friend ID is required'
				},
				400
			);
		}

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
		const friend = await getUserById(friendId, c.env);
		if (!friend) {
			return c.json(
				{
					code: 404,
					message: 'Friend not found'
				},
				404
			);
		}

		try {
			user.account.removeFriend(friend.account);
			await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);

			return c.json(user.public, 200);
		} catch (error) {
			return c.json(
				{
					code: 500,
					message: 'Failed to add friend'
				},
				500
			);
		}
	}
);

export default removeUserFriend;
