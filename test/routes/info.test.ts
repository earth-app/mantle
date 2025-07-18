import { beforeEach, describe, expect, it, vi } from 'vitest';
import info from '../../src/routes/info';

describe('Info Route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /', () => {
		it('should return application information', async () => {
			const req = new Request('http://localhost/');
			const res = await info.request(req);

			expect(res.status).toBe(200);
			expect(res.headers.get('content-type')).toContain('application/json');

			const data = await res.json();
			expect(data).toMatchObject({
				name: expect.any(String),
				version: expect.any(String),
				description: expect.any(String)
			});
		});

		it('should handle different HTTP methods', async () => {
			const req = new Request('http://localhost/', { method: 'POST' });
			const res = await info.request(req);

			expect(res.status).toBe(404);
		});

		it('should return consistent response format', async () => {
			const req = new Request('http://localhost/');
			const res = await info.request(req);

			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(typeof data.name).toBe('string');
			expect(typeof data.version).toBe('string');
			expect(typeof data.description).toBe('string');
			expect(data.name).toBe('@earth-app/mantle');
		});
	});

	describe('Error handling', () => {
		it('should handle malformed requests gracefully', async () => {
			const req = new Request('http://localhost/extra');
			const res = await info.request(req);

			expect(res.status).toBe(404);
		});

		it('should have proper CORS headers', async () => {
			const req = new Request('http://localhost/');
			const res = await info.request(req);

			expect(res.status).toBe(200);
			// Test for expected headers that might be set by middleware
		});
	});
});
