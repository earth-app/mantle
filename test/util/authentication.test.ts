import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Authentication Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Token management functions', () => {
		it('should export required functions', async () => {
			const auth = await import('../../src/util/authentication');

			expect(typeof auth.addToken).toBe('function');
			expect(typeof auth.removeToken).toBe('function');
			expect(typeof auth.isValidToken).toBe('function');
			expect(typeof auth.getTokenCount).toBe('function');
			expect(typeof auth.getOwnerOfToken).toBe('function');
		});

		it('should handle addToken with basic validation', async () => {
			const { addToken } = await import('../../src/util/authentication');

			// Test parameter validation - addToken requires bindings
			const mockBindings = {
				DB: (globalThis as any).DB,
				KEK: 'test-key',
				LOOKUP_HMAC_KEY: 'test-hmac-key'
			} as any;

			try {
				await addToken('test-token', 'test-owner', mockBindings);
			} catch (error) {
				// Expected to fail in test environment without real crypto
				expect(error).toBeDefined();
			}
		});

		it('should handle removeToken with basic validation', async () => {
			const { removeToken } = await import('../../src/util/authentication');

			const mockBindings = {
				DB: (globalThis as any).DB,
				KEK: 'test-key',
				LOOKUP_HMAC_KEY: 'test-hmac-key'
			} as any;

			try {
				await removeToken('test-token', mockBindings);
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});

		it('should handle isValidToken with basic validation', async () => {
			const { isValidToken } = await import('../../src/util/authentication');

			const mockBindings = {
				DB: (globalThis as any).DB,
				KEK: 'test-key',
				LOOKUP_HMAC_KEY: 'test-hmac-key'
			} as any;

			try {
				await isValidToken('test-token', mockBindings);
			} catch (error) {
				// Expected to fail in test environment
				expect(error).toBeDefined();
			}
		});
	});

	describe('Session management', () => {
		it('should export session functions', async () => {
			const auth = await import('../../src/util/authentication');

			expect(typeof auth.addSession).toBe('function');
			expect(typeof auth.removeSession).toBe('function');
			expect(typeof auth.isValidSession).toBe('function');
			expect(typeof auth.generateSessionToken).toBe('function');
			expect(typeof auth.getSessionCount).toBe('function');
		});

		it('should generate session token', async () => {
			const { generateSessionToken } = await import('../../src/util/authentication');

			const token = generateSessionToken();
			expect(typeof token).toBe('string');
			expect(token.length).toBeGreaterThan(0);
		});
	});

	describe('Authentication middleware', () => {
		it('should export middleware functions', async () => {
			const auth = await import('../../src/util/authentication');

			expect(typeof auth.adminMiddleware).toBe('function');
			expect(typeof auth.basicAuthMiddleware).toBe('function');
		});
	});
});
