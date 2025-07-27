import { Context } from 'hono';

export interface MockBindings {
	DB: {
		prepare: (query: string) => {
			bind: (...args: unknown[]) => {
				run: () => Promise<{ success: boolean }>;
				first: <T = unknown>() => Promise<T | null>;
				all: <T = unknown>() => Promise<{ results: T[] }>;
				raw: any;
			};
			run: () => Promise<{ success: boolean }>;
			first: <T = unknown>() => Promise<T | null>;
			all: <T = unknown>() => Promise<{ results: T[] }>;
			raw: any;
		};
		batch: (...args: any[]) => Promise<any[]>;
		exec: (query: string) => Promise<any>;
		withSession: (fn: (session: any) => Promise<any>) => Promise<any>;
		dump: () => Promise<ArrayBuffer>;
	};
	KV: {
		get: (key: string) => Promise<string | null>;
		put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
		delete: (key: string) => Promise<void>;
		list: (options?: any) => Promise<any>;
		getWithMetadata: (key: string, options?: any) => Promise<any>;
	};
	ANONYMOUS_RATE_LIMIT: {
		limit: () => Promise<{ success: boolean }>;
	};
	AUTH_RATE_LIMIT: {
		limit: () => Promise<{ success: boolean }>;
	};
	KEK: string;
	LOOKUP_HMAC_KEY: string;
	ADMIN_API_KEY: string;
}

export const MOCK_BINDINGS: MockBindings = {
	DB: (globalThis as any).mockBindings?.DB || {
		prepare: () => ({
			bind: () => ({
				run: () => Promise.resolve({ success: true }),
				first: () => Promise.resolve(null),
				all: () => Promise.resolve({ results: [] }),
				raw: null
			}),
			run: () => Promise.resolve({ success: true }),
			first: () => Promise.resolve(null),
			all: () => Promise.resolve({ results: [] }),
			raw: null
		}),
		batch: () => Promise.resolve([]),
		exec: () => Promise.resolve({}),
		withSession: (fn: any) => fn({}),
		dump: () => Promise.resolve(new ArrayBuffer(0))
	},
	KV: (globalThis as any).mockBindings?.KV || {
		get: () => Promise.resolve(null),
		put: () => Promise.resolve(undefined),
		delete: () => Promise.resolve(undefined)
	},
	ANONYMOUS_RATE_LIMIT: (globalThis as any).mockBindings?.ANONYMOUS_RATE_LIMIT || {
		limit: () => Promise.resolve({ success: true })
	},
	AUTH_RATE_LIMIT: (globalThis as any).mockBindings?.AUTH_RATE_LIMIT || {
		limit: () => Promise.resolve({ success: true })
	},
	KEK: 'LSBiwQgmG0gCPjYONDSWTBgSyX8xfqFasFY6G0exI94=',
	LOOKUP_HMAC_KEY: 'Lu2ZWrAohkp/lJTL0T4l2f3cpuzsL8v9NLW7C3o+/rY=',
	ADMIN_API_KEY: 'EA25K24Gbc7892e1c5ae7d9fd2af73b4QL4DX'
};

/**
 * Create a mock Hono context for testing
 */
export function createMockContext(options: {
	method?: string;
	url?: string;
	headers?: Record<string, string>;
	body?: string | object;
	env?: Partial<MockBindings>;
}): Context<{ Bindings: MockBindings }> {
	const { method = 'GET', url = 'http://localhost/', headers = {}, body, env = {} } = options;

	const request = new Request(url, {
		method,
		headers: new Headers(headers),
		body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
	});

	// Create a simplified mock context that satisfies the Context interface
	const mockContext = {
		req: {
			url,
			method,
			header: (name: string) => headers[name] || headers[name.toLowerCase()],
			param: (name: string) => {
				// Parse path parameters from URL pattern
				const urlObj = new URL(url);
				const pathSegments = urlObj.pathname.split('/').filter(Boolean);

				// Handle common route parameter patterns
				if (name === 'eventId') {
					// For event routes like /events/:eventId
					const eventIndex = pathSegments.indexOf('events');
					if (eventIndex >= 0 && pathSegments[eventIndex + 1]) {
						return pathSegments[eventIndex + 1];
					}
				}
				if (name === 'activityId') {
					// For activity routes like /activities/:activityId
					const activityIndex = pathSegments.indexOf('activities');
					if (activityIndex >= 0 && pathSegments[activityIndex + 1]) {
						return pathSegments[activityIndex + 1];
					}
				}
				if (name === 'userId') {
					// For user routes like /users/:userId
					const userIndex = pathSegments.indexOf('users');
					if (userIndex >= 0 && pathSegments[userIndex + 1]) {
						return pathSegments[userIndex + 1];
					}
				}

				// Fallback to query parameter
				return urlObj.searchParams.get(name);
			},
			query: (name: string) => {
				const urlObj = new URL(url);
				return urlObj.searchParams.get(name);
			},
			json: () => Promise.resolve(typeof body === 'object' ? body : {}),
			text: () => Promise.resolve(typeof body === 'string' ? body : ''),
			raw: request
		},
		res: {
			headers: new Headers()
		},
		env: {
			...MOCK_BINDINGS,
			...env
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status || 200,
				headers: { 'Content-Type': 'application/json' }
			}),
		text: (text: string, status?: number) =>
			new Response(text, {
				status: status || 200,
				headers: { 'Content-Type': 'text/plain' }
			}),
		html: (html: string, status?: number) =>
			new Response(html, {
				status: status || 200,
				headers: { 'Content-Type': 'text/html' }
			}),
		get: (key: string) => undefined,
		set: (key: string, value: unknown) => {},
		var: {},
		newResponse: (body?: string | ArrayBuffer | ReadableStream, init?: ResponseInit) => new Response(body, init),
		body: request.body,
		bodyCache: {},
		finalized: false
	} as unknown as Context<{ Bindings: MockBindings }>;

	return mockContext;
}

/**
 * Create test credentials for Basic Auth
 */
export function createBasicAuthHeader(username: string, password: string): string {
	return 'Basic ' + btoa(`${username}:${password}`);
}

/**
 * Create test Bearer token header
 */
export function createBearerAuthHeader(token: string): string {
	return `Bearer ${token}`;
}

/**
 * Mock admin token for testing
 */
export const MOCK_ADMIN_TOKEN = 'EA25K24Gbc7892e1c5ae7d9fd2af73b4QL4DX';

/**
 * Mock regular user token for testing
 */
export const MOCK_USER_TOKEN = 'EA25K24Hbc8192ab27fd7d9fd2af74a4XLQ56';
