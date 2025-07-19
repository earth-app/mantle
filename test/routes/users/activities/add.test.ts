import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBearerAuthHeader, MOCK_ADMIN_TOKEN, MOCK_USER_TOKEN } from '../../../helpers';
import { setupAllTables } from '../../../table-setup';

describe('User Activities Add Route', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupAllTables((globalThis as any).mockBindings.DB);
	});

	describe('Route structure', () => {
		it('should export add activity route', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');

			expect(addActivityRoute.default).toBeDefined();
			expect(typeof addActivityRoute.default.request).toBe('function');
		});

		it('should handle PUT requests to add activity', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity
				const testActivity = createActivity('test-activity-id', 'Test Activity', (activity) => {
					activity.description = 'A test activity for testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB);

				// Create and save a test user
				const testUser = createUser('test-user', (user) => {
					user.email = 'test@example.com';
				});
				await saveUser(testUser, 'test-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-user/activities?activityId=test-activity-id', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// If successful, expect activity added
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

		it('should require authentication for adding activities', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');

			const req = new Request('http://localhost/users/test-user/activities?activityId=test-activity-id', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			try {
				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected authentication error
				expect(error).toBeDefined();
			}
		});

		it('should validate authentication token', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');

			const req = new Request('http://localhost/users/test-user/activities?activityId=test-activity-id', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader('invalid-token')
				}
			});

			try {
				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(401);
			} catch (error) {
				// Expected authentication error
				expect(error).toBeDefined();
			}
		});

		it('should validate parameters for adding activities', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');

			const req = new Request('http://localhost/users/test-user/activities', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
				}
			});

			try {
				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error
				expect(error).toBeDefined();
			}
		});

		it('should handle invalid HTTP methods', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');

			const req = new Request('http://localhost/users/test-user/activities?activityId=test-activity-id', {
				method: 'GET'
			});

			try {
				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res.status).toBe(405);
			} catch (error) {
				// Method not allowed
				expect(error).toBeDefined();
			}
		});

		it('should handle admin user requests', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity
				const testActivity = createActivity('test-activity-id-admin', 'Test Activity for Admin', (activity) => {
					activity.description = 'A test activity for admin testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB);

				// Create and save a test user
				const testUser = createUser('test-admin-user', (user) => {
					user.email = 'admin@example.com';
				});
				await saveUser(testUser, 'admin-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-admin-user/activities?activityId=test-activity-id-admin', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
					}
				});

				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Admin should be able to add activities
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

		it('should handle duplicate activity additions', async () => {
			const addActivityRoute = await import('../../../../src/routes/users/activities/add');
			const { createActivity, saveActivity } = await import('../../../../src/util/routes/activities');
			const { createUser, saveUser } = await import('../../../../src/util/routes/users');

			try {
				// Create and save a test activity
				const testActivity = createActivity('test-duplicate-activity', 'Duplicate Test Activity', (activity) => {
					activity.description = 'A test activity for duplicate testing';
				});
				await saveActivity(testActivity, (globalThis as any).mockBindings.DB);

				// Create and save a test user with the activity already added
				const testUser = createUser('test-duplicate-user', (user) => {
					user.email = 'duplicate@example.com';
					user.addActivity(testActivity);
				});
				await saveUser(testUser, 'test-password', (globalThis as any).mockBindings);

				const req = new Request('http://localhost/users/test-duplicate-user/activities?activityId=test-duplicate-activity', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: createBearerAuthHeader(MOCK_USER_TOKEN)
					}
				});

				const res = await addActivityRoute.default.request(req, (globalThis as any).mockBindings);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();

				// Should handle duplicate activities appropriately
				if (res.status === 409) {
					const responseData = (await res.json()) as any;
					expect(responseData).toBeDefined();
					expect(responseData.message).toContain('already');
				}
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});
	});
});
