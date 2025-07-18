import type { KVNamespace } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import Bindings from '../bindings';
import { getOwnerOfBearer } from './authentication';

export interface RateLimitConfig {
	requests: number;
	windowMs: number;
	keyPrefix: string;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetTime: number;
	total: number;
}

/**
 * Check if a user is an administrator based on the adminMiddleware logic
 */
async function isUserAdmin(c: Context<{ Bindings: Bindings }>): Promise<boolean> {
	const bearerToken = c.req.header('Authorization');
	if (!bearerToken || !bearerToken.startsWith('Bearer ')) return false;

	const token = bearerToken.slice(7);
	if (token.length !== 64) return false; // com.earthapp.util.API_KEY_LENGTH

	if (token === c.env.ADMIN_API_KEY) return true;

	const owner = await getOwnerOfBearer(c);
	return owner?.account.isAdmin || false;
}

/**
 * Generate a rate limit key for KV storage
 */
function generateRateLimitKey(config: RateLimitConfig, identifier: string): string {
	const windowStart = Math.floor(Date.now() / config.windowMs) * config.windowMs;
	return `${config.keyPrefix}:${identifier}:${windowStart}`;
}

/**
 * Check rate limit using KV namespace
 */
export async function checkKVRateLimit(kv: KVNamespace, config: RateLimitConfig, identifier: string): Promise<RateLimitResult> {
	const key = generateRateLimitKey(config, identifier);
	const currentTime = Date.now();
	const windowStart = Math.floor(currentTime / config.windowMs) * config.windowMs;
	const resetTime = windowStart + config.windowMs;

	try {
		const currentValue = await kv.get(key);
		const currentCount = currentValue ? parseInt(currentValue, 10) : 0;

		if (currentCount >= config.requests) {
			return {
				allowed: false,
				remaining: 0,
				resetTime,
				total: config.requests
			};
		}

		// Increment the counter
		const newCount = currentCount + 1;
		const ttl = Math.ceil((resetTime - currentTime) / 1000); // TTL in seconds

		await kv.put(key, newCount.toString(), { expirationTtl: ttl });

		return {
			allowed: true,
			remaining: config.requests - newCount,
			resetTime,
			total: config.requests
		};
	} catch (error) {
		// If KV fails, allow the request (fail open)
		console.error('KV rate limit check failed:', error);
		return {
			allowed: true,
			remaining: config.requests - 1,
			resetTime,
			total: config.requests
		};
	}
}

/**
 * Create KV rate limit middleware
 */
export function kvRateLimit(config: RateLimitConfig) {
	return async (c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) => {
		// Skip rate limiting for administrators
		const isAdmin = await isUserAdmin(c);
		if (isAdmin) {
			return next();
		}

		// Use IP address as identifier, fallback to 'anonymous'
		const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'anonymous';

		const result = await checkKVRateLimit(c.env.KV, config, ip);

		// Add rate limit headers
		c.res.headers.set('X-RateLimit-Limit', config.requests.toString());
		c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
		c.res.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

		if (!result.allowed) {
			return c.json(
				{
					error: 'Rate limit exceeded',
					message: `Too many requests. Limit: ${config.requests} requests per ${config.windowMs / 1000} seconds.`,
					retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
				},
				429
			);
		}

		return next();
	};
}

/**
 * Create user-specific KV rate limit middleware (requires authentication)
 */
export function kvUserRateLimit(config: RateLimitConfig) {
	return async (c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) => {
		// Skip rate limiting for administrators
		const isAdmin = await isUserAdmin(c);
		if (isAdmin) {
			return next();
		}

		// Get user identifier from bearer token
		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json({ error: 'Authentication required for this rate-limited endpoint' }, 401);
		}

		const userId = owner.account.id;
		const result = await checkKVRateLimit(c.env.KV, config, `user:${userId}`);

		// Add rate limit headers
		c.res.headers.set('X-RateLimit-Limit', config.requests.toString());
		c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
		c.res.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

		if (!result.allowed) {
			return c.json(
				{
					error: 'Rate limit exceeded',
					message: `Too many requests. Limit: ${config.requests} requests per ${config.windowMs / 1000} seconds.`,
					retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
				},
				429
			);
		}

		return next();
	};
}

/**
 * Predefined rate limit configurations
 */
export const rateLimitConfigs = {
	// 1. POST /v1/users/create - 3 times every 5 minutes
	userCreate: {
		requests: 3,
		windowMs: 5 * 60 * 1000, // 5 minutes
		keyPrefix: 'rl:user:create'
	},
	// 2. POST /v1/users/login - 5 times every minute
	userLogin: {
		requests: 5,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:user:login'
	},
	// 3. PATCH /v1/users/current - 10 times every minute
	userUpdate: {
		requests: 10,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:user:update'
	},
	// 4. Event creation - every 2 minutes per user
	eventCreate: {
		requests: 1,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:event:create'
	},
	// 5. Event update - every 2 minutes per user
	eventUpdate: {
		requests: 1,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:event:update'
	}
} as const;
