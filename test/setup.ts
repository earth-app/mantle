import { beforeEach, vi } from 'vitest';
(globalThis as any).process = (globalThis as any).process || {
	env: {
		KEK: 'LSBiwQgmG0gCPjYONDSWTBgSyX8xfqFasFY6G0exI94=',
		LOOKUP_HMAC_KEY: 'Lu2ZWrAohkp/lJTL0T4l2f3cpuzsL8v9NLW7C3o+/rY=',
		ADMIN_API_KEY: 'EA25K24Gbc7892e1c5ae7d9fd2af73b4QL4DX'
	}
};

// Create a comprehensive mock for Cloudflare Workers bindings
const createMockBindings = () => ({
	DB: {
		prepare: vi.fn((query: string) => ({
			bind: vi.fn((...args: unknown[]) => ({
				run: vi.fn().mockResolvedValue({ success: true }),
				first: vi.fn().mockResolvedValue(null),
				all: vi.fn().mockResolvedValue({ results: [] })
			})),
			run: vi.fn().mockResolvedValue({ success: true }),
			first: vi.fn().mockResolvedValue(null),
			all: vi.fn().mockResolvedValue({ results: [] })
		}))
	},
	KV: {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined)
	},
	ANONYMOUS_RATE_LIMIT: {
		limit: vi.fn().mockResolvedValue({ success: true })
	},
	AUTH_RATE_LIMIT: {
		limit: vi.fn().mockResolvedValue({ success: true })
	},
	KEK: 'LSBiwQgmG0gCPjYONDSWTBgSyX8xfqFasFY6G0exI94=',
	LOOKUP_HMAC_KEY: 'Lu2ZWrAohkp/lJTL0T4l2f3cpuzsL8v9NLW7C3o+/rY=',
	ADMIN_API_KEY: 'EA25K24Gbc7892e1c5ae7d9fd2af73b4QL4DX'
});

// Add mock bindings to global context
beforeEach(() => {
	(globalThis as any).mockBindings = createMockBindings();
});

// Mock Cloudflare Workers runtime modules
vi.mock('cloudflare:workers', () => ({
	default: {}
}));

// Mock @hono-rate-limiter/cloudflare
vi.mock('@hono-rate-limiter/cloudflare', () => ({
	cloudflareRateLimiter: vi.fn(() => {
		return vi.fn((c, next) => next());
	})
}));

// Mock hono/cloudflare-workers
vi.mock('hono/cloudflare-workers', () => ({
	getConnInfo: vi.fn(() => ({
		remote: { address: '127.0.0.1' }
	}))
}));

// Mock Cloudflare Workers environment
beforeEach(() => {
	// Mock crypto for tests
	if (!globalThis.crypto) {
		globalThis.crypto = {
			getRandomValues: vi.fn((arr) => {
				for (let i = 0; i < arr.length; i++) {
					arr[i] = Math.floor(Math.random() * 256);
				}
				return arr;
			}),
			randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
			subtle: {
				digest: vi.fn(async (algorithm, data) => {
					// Mock SHA-256 hash
					const hash = new Uint8Array(32);
					for (let i = 0; i < 32; i++) {
						hash[i] = Math.floor(Math.random() * 256);
					}
					return hash.buffer;
				}),
				encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
				decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
				generateKey: vi.fn().mockResolvedValue({}),
				importKey: vi.fn().mockResolvedValue({}),
				exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
				deriveKey: vi.fn().mockResolvedValue({}),
				deriveBits: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
				sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
				verify: vi.fn().mockResolvedValue(true)
			}
		} as any;
	}

	// Mock btoa/atob if not available
	if (!globalThis.btoa) {
		globalThis.btoa = (str: string) => {
			const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
			let result = '';
			let i = 0;
			while (i < str.length) {
				const a = str.charCodeAt(i++);
				const b = i < str.length ? str.charCodeAt(i++) : 0;
				const c = i < str.length ? str.charCodeAt(i++) : 0;
				const bitmap = (a << 16) | (b << 8) | c;
				result +=
					chars.charAt((bitmap >> 18) & 63) +
					chars.charAt((bitmap >> 12) & 63) +
					(i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=') +
					(i - 1 < str.length ? chars.charAt(bitmap & 63) : '=');
			}
			return result;
		};
	}
	if (!globalThis.atob) {
		globalThis.atob = (str: string) => {
			const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
			let result = '';
			let i = 0;
			while (i < str.length) {
				const encoded1 = chars.indexOf(str.charAt(i++));
				const encoded2 = chars.indexOf(str.charAt(i++));
				const encoded3 = chars.indexOf(str.charAt(i++));
				const encoded4 = chars.indexOf(str.charAt(i++));
				const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
				result += String.fromCharCode((bitmap >> 16) & 255);
				if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
				if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
			}
			return result;
		};
	}

	// Mock D1 Database
	const mockD1 = {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockResolvedValue(null),
				all: vi.fn().mockResolvedValue({ results: [] }),
				run: vi.fn().mockResolvedValue({ success: true })
			}),
			first: vi.fn().mockResolvedValue(null),
			all: vi.fn().mockResolvedValue({ results: [] }),
			run: vi.fn().mockResolvedValue({ success: true })
		}),
		exec: vi.fn().mockResolvedValue([])
	};

	(globalThis as any).DB = mockD1;

	// Mock rate limiters
	(globalThis as any).ANONYMOUS_RATE_LIMIT = {
		limit: vi.fn().mockResolvedValue({ success: true })
	};
	(globalThis as any).AUTH_RATE_LIMIT = {
		limit: vi.fn().mockResolvedValue({ success: true })
	};

	// Mock console to reduce noise during tests
	(globalThis as any).console = {
		...console,
		log: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	};
});
