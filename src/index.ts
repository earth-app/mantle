import { swaggerUI } from '@hono/swagger-ui';
import { Hono } from 'hono';
import { openAPISpecs } from 'hono-openapi';

import { cache } from 'hono/cache';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import routes from './routes';
import { globalRateLimit } from './util/ratelimit';

import { Request } from '@cloudflare/workers-types';
import { getClosestRegionFromIP } from '@earth-app/collegedb';
import { HTTPException } from 'hono/http-exception';
import * as packageJson from '../package.json';
import Bindings from './bindings';
import { DBError, ValidationError } from './types/errors';
import { setCurrentRegion } from './util/collegedb';

const app = new Hono<{ Bindings: Bindings }>();

// Error handling middleware
app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json(
			{
				code: err.status,
				message: err.message
			},
			err.status
		);
	}

	if (err instanceof ValidationError) {
		return c.json(
			{
				code: 400,
				message: `Validation Error: ${err.message}`
			},
			400
		);
	}

	if (err instanceof DBError) {
		console.error('Database Error:', err);
		return c.json(
			{
				code: 500,
				message: `Database Error: ${err.message}`
			},
			500
		);
	}

	console.error('Reported Error:', err);
	return c.json(
		{
			code: 500,
			message: 'Internal Server Error'
		},
		500
	);
});

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
	// Custom headers middleware
	c.res.headers.set('X-Earth-App-Version', packageJson.version);
	c.res.headers.set('X-Earth-App-Name', packageJson.name);

	// Set Target Region
	setCurrentRegion(getClosestRegionFromIP(c.req.raw as unknown as Request));

	return next();
});

app.get(
	'/v1/*',
	cache({
		// Cache middleware
		cacheName: 'earth-app-cache',
		cacheControl: 'public, max-age=60, s-maxage=60',
		vary: ['Accept-Encoding', 'Authorization']
	})
);
app.use('/v1/*', globalRateLimit());

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
