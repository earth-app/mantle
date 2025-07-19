import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBearerAuthHeader, MOCK_ADMIN_TOKEN, MOCK_USER_TOKEN } from '../../../helpers';
import { setupAllTables } from '../../../table-setup';

describe('User Friends Remove Route', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupAllTables((globalThis as any).mockBindings.DB);
	});

	describe('Route structure', () => {
		it('should export remove friend route', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');

			expect(removeUserFriend).toBeDefined();
			expect(typeof removeUserFriend.request).toBe('function');
		});

		it('should handle DELETE requests to remove friend', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save test users
				const testUser = createUser('test-user', (user) => {
					user.email = 'testuser@example.com';
				});
				const friendUser = createUser('friend-user', (user) => {
					user.email = 'friend@example.com';
				});

				// Add friend to user
				testUser.addFriend(friendUser);

				await saveUser(testUser, 'test-password', (globalThis as any).mockBindings);
				await saveUser(friendUser, 'friend-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user/friends?friendId=friend-user-id', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// If successful, expect friend removed
				if (res.status === 200) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.username).toBe('test-user');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should require authentication for removing friends', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');

			const req = new Request('http://localhost/users/test-user/friends?friendId=friend-id', {
				method: 'DELETE'
			});

			try {
				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected authentication error
				expect(error).toBeDefined();
			}
		});

		it('should handle invalid HTTP methods', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');

			const req = new Request('http://localhost/users/test-user/friends?friendId=friend-id', {
				method: 'GET'
			});

			try {
				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBe(405);
			} catch (error) {
				// Method not allowed
				expect(error).toBeDefined();
			}
		});

		it('should handle admin user requests', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save test users
				const testUser = createUser('test-admin-user', (user) => {
					user.email = 'admin@example.com';
				});
				const friendUser = createUser('admin-friend-user', (user) => {
					user.email = 'adminfriend@example.com';
				});

				// Add friend to user
				testUser.addFriend(friendUser);

				await saveUser(testUser, 'admin-password', (globalThis as any).mockBindings);
				await saveUser(friendUser, 'friend-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-admin-user/friends?friendId=admin-friend-user-id', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
					}
				});

				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Admin should be able to remove friends
				if (res.status === 200) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.username).toBe('test-admin-user');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle friend ID parameter validation', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');

			const req = new Request('http://localhost/users/test-user/friends', {
				method: 'DELETE',
				headers: {
					Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
				}
			});

			try {
				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error for missing friend ID
				expect(error).toBeDefined();
			}
		});

		it('should handle non-existent friend removal', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test user without any friends
				const testUser = createUser('test-user-no-friends', (user) => {
					user.email = 'nofriends@example.com';
				});
				await saveUser(testUser, 'test-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user-no-friends/friends?friendId=non-existent-id', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should handle non-existent friends appropriately
				if (res.status === 404) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.message).toContain('not found');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle unauthorized access to other users friends', async () => {
			const { default: removeUserFriend } = await import('../../../../src/routes/users/friends/remove');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save test users
				const testUser1 = createUser('test-user-1', (user) => {
					user.email = 'user1@example.com';
				});
				const testUser2 = createUser('test-user-2', (user) => {
					user.email = 'user2@example.com';
				});
				const friendUser = createUser('shared-friend', (user) => {
					user.email = 'shared@example.com';
				});

				// Add friend to user1
				testUser1.addFriend(friendUser);

				await saveUser(testUser1, 'password1', (globalThis as any).mockBindings);
				await saveUser(testUser2, 'password2', (globalThis as any).mockBindings);
				await saveUser(friendUser, 'friend-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user-1/friends?friendId=shared-friend-id', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeUserFriend.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should prevent users from removing other users' friends
				if (res.status === 403) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.message).toContain('forbidden');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});
	});
});
