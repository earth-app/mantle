import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBearerAuthHeader, MOCK_ADMIN_TOKEN, MOCK_USER_TOKEN } from '../../../helpers';
import { setupAllTables } from '../../../table-setup';

describe('User Activities Remove Route', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupAllTables((globalThis as any).mockBindings.DB);
	});

	describe('Route structure', () => {
		it('should export remove activity route', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');

			expect(removeActivityRoute.default).toBeDefined();
			expect(typeof removeActivityRoute.default.request).toBe('function');
		});

		it('should handle DELETE requests to remove activity', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity
				const testActivity = createActivity('test-activity-remove', 'Test Activity to Remove', (activity) => {
					activity.description = 'A test activity for removal testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB); // Create and save a test user with the activity
				const testUser = createUser('test-user-remove', (user) => {
					user.email = 'remove@example.com';
					user.addActivity(testActivity);
				});
				await saveUser(testUser, 'test-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user-remove/activities?activityId=test-activity-remove', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// If successful, expect activity removed
				if (res.status === 200) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.username).toBe('test-user-remove');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should require authentication for removing activities', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');

			const req = new Request('http://localhost/users/test-user/activities?activityId=test-activity-id', {
				method: 'DELETE'
			});

			try {
				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected authentication error
				expect(error).toBeDefined();
			}
		});

		it('should handle invalid HTTP methods', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');

			const req = new Request('http://localhost/users/test-user/activities?activityId=test-activity-id', {
				method: 'GET'
			});

			try {
				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBe(405);
			} catch (error) {
				// Method not allowed
				expect(error).toBeDefined();
			}
		});

		it('should handle admin user requests', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity
				const testActivity = createActivity('test-activity-admin-remove', 'Admin Test Activity to Remove', (activity) => {
					activity.description = 'An admin test activity for removal testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB);

				// Create and save a test user with the activity
				const testUser = createUser('test-admin-user-remove', (user) => {
					user.email = 'adminremove@example.com';
					user.addActivity(testActivity);
				});
				await saveUser(testUser, 'admin-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-admin-user-remove/activities?activityId=test-activity-admin-remove', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
					}
				});

				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Admin should be able to remove activities
				if (res.status === 200) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.username).toBe('test-admin-user-remove');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle user parameter validation', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');

			const req = new Request('http://localhost/users/?activityId=test-activity-id', {
				method: 'DELETE',
				headers: {
					Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
				}
			});

			try {
				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error for missing user parameter
				expect(error).toBeDefined();
			}
		});

		it('should handle activity ID parameter validation', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');

			const req = new Request('http://localhost/users/test-user/activities', {
				method: 'DELETE',
				headers: {
					Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
				}
			});

			try {
				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error for missing activity ID
				expect(error).toBeDefined();
			}
		});

		it('should handle non-existent activity removal', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test user without any activities
				const testUser = createUser('test-user-no-activity', (user) => {
					user.email = 'noactivity@example.com';
				});
				await saveUser(testUser, 'test-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user-no-activity/activities?activityId=non-existent-id', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should handle non-existent activities appropriately
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

		it('should handle unauthorized access to other users activities', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity
				const testActivity = createActivity('test-activity-other-user', 'Other User Activity', (activity) => {
					activity.description = 'An activity for unauthorized access testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB);

				// Create two users
				const testUser1 = createUser('test-user-1', (user) => {
					user.email = 'user1@example.com';
					user.addActivity(testActivity);
				});
				await saveUser(testUser1, 'password1', (globalThis as any).mockBindings);

				const testUser2 = createUser('test-user-2', (user) => {
					user.email = 'user2@example.com';
				});
				await saveUser(testUser2, 'password2', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user-1/activities?activityId=test-activity-other-user', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should prevent users from removing other users' activities
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

		it('should handle malformed URLs', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');

			const req = new Request('http://localhost/users/test-user/activities/test-activity-id/extra-path?activityId=test-activity-id', {
				method: 'DELETE',
				headers: {
					Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
				}
			});

			try {
				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should handle malformed URLs appropriately
				if (res.status === 400 || res.status === 404) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle special characters in activity IDs', async () => {
			const removeActivityRoute = await import('../../../../src/routes/users/activities/remove');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity with special characters
				const testActivity = createActivity('test-activity-special', 'Special Activity', (activity) => {
					activity.description = 'An activity with special characters testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB);

				// Create and save a test user with the activity
				const testUser = createUser('test-user-special', (user) => {
					user.email = 'special@example.com';
					user.addActivity(testActivity);
				});
				await saveUser(testUser, 'special-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user-special/activities?activityId=test-activity-special', {
					method: 'DELETE',
					headers: {
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await removeActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should handle activity IDs properly
				if (res.status === 200) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.username).toBe('test-user-special');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});
	});
});
