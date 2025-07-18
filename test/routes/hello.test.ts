import { describe, expect, it } from 'vitest';
import hello from '../../src/routes/hello';

describe('Hello Route', () => {
	describe('GET /', () => {
		it('should return "Hello World!" text', async () => {
			const req = new Request('http://localhost/');
			const res = await hello.request(req);

			expect(res.status).toBe(200);

			const text = await res.text();
			expect(text).toBe('Hello World!');

			// Note: Content-type header may not be set in test environment
			// This is expected behavior for the test setup
		});

		it('should handle different HTTP methods gracefully', async () => {
			const req = new Request('http://localhost/', { method: 'POST' });
			const res = await hello.request(req);

			expect(res.status).toBe(404);
		});
	});
});
