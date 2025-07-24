import type { KVNamespace } from '@cloudflare/workers-types';
import { com } from '@earth-app/ocean';
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
	if (token.length !== com.earthapp.util.API_KEY_LENGTH) return false;

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
export function ipRateLimit(config: RateLimitConfig) {
	return async (c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) => {
		// Skip rate limiting for administrators
		const isAdmin = await isUserAdmin(c);
		if (isAdmin) return next();

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
export function authRateLimit(config: RateLimitConfig) {
	return async (c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) => {
		// Skip rate limiting for administrators
		const isAdmin = await isUserAdmin(c);
		if (isAdmin) return next();

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
	// 1 every 5 minutes per user
	userCreate: {
		requests: 1,
		windowMs: 5 * 60 * 1000, // 5 minutes
		keyPrefix: 'rl:user:create'
	},
	// 3 every 1 minute per user
	userLogin: {
		requests: 3,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:user:login'
	},
	// 10 every 1 minute per user
	userUpdate: {
		requests: 10,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:user:update'
	},
	// 3 every 2 minutes per user
	eventCreate: {
		requests: 3,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:event:create'
	},
	// 5 every 2 minutes per user
	eventUpdate: {
		requests: 5,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:event:update'
	},
	// 7 every 2 minutes per user
	promptCreate: {
		requests: 7,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:prompt:create'
	},
	// 15 every 2 minutes per user
	promptUpdate: {
		requests: 15,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:prompt:update'
	},
	// 2 every 30 seconds per user
	promptResponseCreate: {
		requests: 2,
		windowMs: 30 * 1000, // 30 seconds
		keyPrefix: 'rl:prompt:response'
	},
	// 1 every minute per user
	promptResponseUpdate: {
		requests: 1,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:prompt:response:update'
	}
} as const;
