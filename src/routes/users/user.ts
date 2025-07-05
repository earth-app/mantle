import { Hono } from 'hono';

import Bindings from '../../bindings';
import { deleteUser, getUserById, getUserByUsername, patchUser } from '../../util/routes/users';
import { bearerAuthMiddleware, getOwnerOfToken } from '../../util/authentication';
import { UserObject } from '../../types/users';
import { com } from '@earth-app/ocean';

const user = new Hono<{ Bindings: Bindings }>();

// Get User
user.get('/', async (c) => {
	const path = c.req.param('id');
	let user: UserObject | null;

	// Current User
	if (!path) {
		const bearerToken = c.req.header('Authorization');
		if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const token = bearerToken.slice(7);

		user = await getOwnerOfToken(token, c.env);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}
	} else {
		if (path.startsWith('@')) {
			// By Username
			const username = path.slice(1);
			user = await getUserByUsername(username, c.env);
		} else {
			// By ID
			user = await getUserById(path, c.env);
		}
	}

	if (!user) {
		return c.json(
			{
				code: 404,
				message: 'User not found'
			},
			404
		);
	}

	switch (user.account.visibility.name.toLowerCase()) {
		// Unlisted - Requires authentication
		case 'unlisted': {
			if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
				return c.json(
					{
						code: 403,
						message: 'Forbidden: This user is unlisted and requires authentication to view.'
					},
					403
				);
			}
			break;
		}
		// Private - Admin only
		case 'private': {
			if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
				return c.json(
					{
						code: 403,
						message: 'Forbidden: This user is private.'
					},
					403
				);
			}

			const token = c.req.header('Authorization')!.slice(7);
			if (token !== c.env.ADMIN_API_KEY) {
				return c.json(
					{
						code: 403,
						message: 'Forbidden: You do not have permission to view this user.'
					},
					403
				);
			}

			break;
		}
	}

	return c.json(user.public);
});

// Patch User
user.patch('/', bearerAuthMiddleware(), async (c) => {
	const rawBody = await c.req.text();
	if (!rawBody) {
		return c.json(
			{
				code: 400,
				message: 'Request body cannot be empty'
			},
			400
		);
	}

	let data: Partial<com.earthapp.account.Account> = await c.req.json();
	if (!data || typeof data !== 'object') {
		return c.json(
			{
				code: 400,
				message: 'Invalid request body'
			},
			400
		);
	}

	const bearerToken = c.req.header('Authorization');
	if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
		return c.json(
			{
				code: 401,
				message: 'Unauthorized'
			},
			401
		);
	}

	const token = bearerToken.slice(7);
	const path = c.req.param('id');
	let user: UserObject | null;

	// Current User
	if (!path) {
		user = await getOwnerOfToken(token, c.env);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}
	} else {
		if (token !== c.env.ADMIN_API_KEY) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to update this user.'
				},
				403
			);
		}

		if (path.startsWith('@')) {
			// By Username
			const username = path.slice(1);
			user = await getUserByUsername(username, c.env);
		} else {
			// By ID
			user = await getUserById(path, c.env);
		}
	}

	if (!user) {
		return c.json(
			{
				code: 404,
				message: 'User not found'
			},
			404
		);
	}

	if (data.type || data.id) {
		data = {
			...data,
			type: undefined, // Prevent type changes
			id: undefined // Prevent ID changes
		};
	}

	// Update user properties
	await patchUser(user.account, data, c.env);
	const returned = (await getUserById(user.account.id, c.env))!.public;

	return c.json(returned, 200);
});

// Delete User
user.delete('/', bearerAuthMiddleware(), async (c) => {
	const bearerToken = c.req.header('Authorization');
	if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
		return c.json(
			{
				code: 401,
				message: 'Unauthorized'
			},
			401
		);
	}

	const token = bearerToken.slice(7);
	const path = c.req.param('id');
	let user: UserObject | null;

	// Current User
	if (!path) {
		user = await getOwnerOfToken(token, c.env);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}
	} else {
		if (token !== c.env.ADMIN_API_KEY) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to delete this user.'
				},
				403
			);
		}

		if (path.startsWith('@')) {
			// By Username
			const username = path.slice(1);
			user = await getUserByUsername(username, c.env);
		} else {
			// By ID
			user = await getUserById(path, c.env);
		}
	}

	if (!user) {
		return c.json(
			{
				code: 404,
				message: 'User not found'
			},
			404
		);
	}

	// Delete the user
	await deleteUser(user.account.id, c.env);

	return c.body(null, 204);
});

export default user;
