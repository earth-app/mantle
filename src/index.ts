import { Hono } from 'hono';
import { openAPISpecs } from 'hono-openapi';
import { swaggerUI } from '@hono/swagger-ui';

import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { cache } from 'hono/cache';
import { secureHeaders } from 'hono/secure-headers';

import routes from './routes';
import { rateLimit } from './util/ratelimit';

import * as packageJson from '../package.json';
import Bindings from './bindings';

const app = new Hono<{ Bindings: Bindings }>();

app.use(secureHeaders()); // Secure headers middleware
app.use(logger()); // Logger middleware
app.use(
	cors({
		// CORS middleware
		origin: '*',
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 3600
	})
);
app.use((c, next) => {
	c.res.headers.set('X-Earth-App-Version', packageJson.version);
	c.res.headers.set('X-Earth-App-Name', packageJson.name);

	return next();
}); // Custom headers middleware

app.get(
	'/v1/*',
	cache({
		// Cache middleware
		cacheName: 'earth-app-cache',
		cacheControl: 'public, max-age=60, s-maxage=60',
		vary: ['Accept-Encoding', 'Authorization']
	})
);
app.use('/v1/*', rateLimit());

// Declare routes
app.route('/v1', routes);

// OpenAPI & Swagger UI
app.get(
	'/openapi',
	openAPISpecs(app, {
		documentation: {
			info: {
				title: packageJson.name,
				version: packageJson.version,
				description: packageJson.description
			},
			servers: [
				{
					url: 'https://api.earth-app.com',
					description: 'Production Server'
				},
				{
					url: 'http://127.0.0.1:8787',
					description: 'Local Server'
				}
			],
			components: {
				securitySchemes: {
					BasicAuth: {
						type: 'http',
						scheme: 'basic'
					},
					BearerAuth: {
						type: 'http',
						scheme: 'bearer',
						bearerFormat: 'JWT'
					}
				}
			},
			security: [{ BasicAuth: [] }, { BearerAuth: [] }]
		}
	})
);

app.get(
	'/',
	swaggerUI({
		title: packageJson.name,
		url: '/openapi'
	})
);

export default app;
