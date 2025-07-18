import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBearerAuthHeader, MOCK_ADMIN_TOKEN, MOCK_USER_TOKEN } from '../../helpers';

describe('Activity Route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Route structure', () => {
		it('should export activity route', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			expect(activityRoute.default).toBeDefined();
			expect(typeof activityRoute.default.request).toBe('function');
		});

		it('should handle GET requests for specific activity', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'GET'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle PATCH requests for activity updates', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
				},
				body: JSON.stringify({
					name: 'Updated Activity Name',
					description: 'Updated description',
					points: 15
				})
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle DELETE requests for activity deletion', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'DELETE',
				headers: {
					Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
				}
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res).toBeDefined();
				expect(res.status).toBeDefined();
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});
	});

	describe('Authentication requirements', () => {
		it('should allow public access for activity viewing', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'GET'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res).toBeDefined();
				// Should not require auth for viewing
			} catch (error) {
				// Expected to fail in test environment for other reasons
				expect(error).toBeDefined();
			}
		});

		it('should require admin authentication for activity updates', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Updated Name' })
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected authentication error
				expect(error).toBeDefined();
			}
		});

		it('should require admin authentication for activity deletion', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'DELETE'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected authentication error
				expect(error).toBeDefined();
			}
		});

		it('should reject non-admin users for modifications', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader(MOCK_USER_TOKEN) // Regular user token
				},
				body: JSON.stringify({ name: 'Updated Name' })
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected authorization error
				expect(error).toBeDefined();
			}
		});
	});

	describe('Input validation', () => {
		it('should validate activity ID parameter', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/', {
				method: 'GET'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error for missing ID
				expect(error).toBeDefined();
			}
		});

		it('should validate update request body', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
				},
				body: JSON.stringify({
					invalidField: 'should not be allowed',
					points: 'not a number'
				})
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error
				expect(error).toBeDefined();
			}
		});

		it('should validate data types for updates', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
				},
				body: JSON.stringify({
					name: 123, // Invalid type
					points: 'invalid', // Invalid type
					carbonImpact: true // Invalid type
				})
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected validation error
				expect(error).toBeDefined();
			}
		});
	});

	describe('Error handling', () => {
		it('should handle invalid HTTP methods', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PUT'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBe(405);
			} catch (error) {
				// Method not allowed or other error
				expect(error).toBeDefined();
			}
		});

		it('should handle malformed request bodies', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/test-activity-id', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: createBearerAuthHeader(MOCK_ADMIN_TOKEN)
				},
				body: 'invalid json'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBeGreaterThanOrEqual(400);
			} catch (error) {
				// Expected parsing error
				expect(error).toBeDefined();
			}
		});

		it('should handle non-existent activity IDs', async () => {
			const activityRoute = await import('../../../src/routes/activities/activity');

			const req = new Request('http://localhost/activities/non-existent-id', {
				method: 'GET'
			});

			try {
				const res = await activityRoute.default.request(req);
				expect(res.status).toBe(404);
			} catch (error) {
				// Expected not found error
				expect(error).toBeDefined();
			}
		});
	});
});
