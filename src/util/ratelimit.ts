import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare';
import { getConnInfo } from 'hono/cloudflare-workers';
import Bindings from '../bindings';

export function globalRateLimit(authenticated: boolean = false) {
	return cloudflareRateLimiter<{ Bindings: Bindings }>({
		rateLimitBinding: (c) => (authenticated ? c.env.AUTH_RATE_LIMIT : c.env.ANONYMOUS_RATE_LIMIT),
		keyGenerator: (c) => c.req.header('CF-Connecting-IP') || getConnInfo(c).remote.address || ''
	});
}
