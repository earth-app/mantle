import type { KVNamespace } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import Bindings from '../bindings';

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
		const ttl = Math.max(60, Math.ceil((resetTime - currentTime) / 1000)); // TTL in seconds

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
 * Predefined rate limit configurations
 */
export const rateLimitConfigs = {
	// 5 every 5 minutes per IP
	userCreate: {
		requests: 5,
		windowMs: 5 * 60 * 1000, // 5 minutes
		keyPrefix: 'rl:user:create'
	},
	// 3 every 1 minute per IP
	userLogin: {
		requests: 3,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:user:login'
	},
	// 10 every 1 minute per IP
	userUpdate: {
		requests: 10,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:user:update'
	},
	// 3 every 2 minutes per IP
	eventCreate: {
		requests: 3,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:event:create'
	},
	// 5 every 2 minutes per IP
	eventUpdate: {
		requests: 5,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:event:update'
	},
	// 25 every 5 minutes per IP
	randomActivityRefresh: {
		requests: 25,
		windowMs: 5 * 60 * 1000, // 5 minutes
		keyPrefix: 'rl:activity:random:refresh'
	},
	// 10 every 3 minutes per IP
	randomPromptRefresh: {
		requests: 10,
		windowMs: 3 * 60 * 1000, // 3 minutes
		keyPrefix: 'rl:prompt:random:refresh'
	},
	// 7 every 2 minutes per IP
	promptCreate: {
		requests: 7,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:prompt:create'
	},
	// 15 every 2 minutes per IP
	promptUpdate: {
		requests: 15,
		windowMs: 2 * 60 * 1000, // 2 minutes
		keyPrefix: 'rl:prompt:update'
	},
	// 2 every 30 seconds per IP
	promptResponseCreate: {
		requests: 2,
		windowMs: 30 * 1000, // 30 seconds
		keyPrefix: 'rl:prompt:response'
	},
	// 1 every minute per IP
	promptResponseUpdate: {
		requests: 1,
		windowMs: 60 * 1000, // 1 minute
		keyPrefix: 'rl:prompt:response:update'
	},
	// 1 every 3 minutes per IP
	articleCreate: {
		requests: 1,
		windowMs: 2 * 60 * 1000, // 3 minutes
		keyPrefix: 'rl:article:create'
	},
	// 2 every 3 minutes per IP
	articleUpdate: {
		requests: 2,
		windowMs: 3 * 60 * 1000, // 3 minutes
		keyPrefix: 'rl:article:update'
	}
} as const;
