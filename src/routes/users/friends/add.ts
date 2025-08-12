import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../../openapi/schemas';
import * as tags from '../../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../../bindings';
import { getAuthenticatedUserFromContext, getUserById, updateUser } from '../../../util/routes/users';

const addUserFriend = new Hono<{ Bindings: Bindings }>();

addUserFriend.put(
	'/',
	describeRoute({
		summary: 'Add a friend to the authenticated user',
		description: 'Adds a user as a friend to the authenticated user.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'friendId',
				in: 'query',
				description: 'ID of the user to add as a friend',
				required: true,
				schema: schemas.idParam
			}
		],
		responses: {
			200: {
				description: 'Friend added successfully',
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

		if (user.account.getFriendIds().asJsReadonlySetView().has(friend.account.id)) {
			return c.json(
				{
					code: 409,
					message: `User ${friend.public.username} is already a friend`
				},
				409
			);
		}

		if (user.account.id === friend.account.id) {
			return c.json(
				{
					code: 400,
					message: 'You cannot add yourself as a friend'
				},
				400
			);
		}

		user.account.addFriend(friend.account);
		await updateUser(user, com.earthapp.Visibility.PRIVATE, c.env);

		return c.json(user.public, 200);
	}
);

export default addUserFriend;
