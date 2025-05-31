import { Hono } from 'hono'
import { openAPISpecs } from 'hono-openapi'
import { swaggerUI } from "@hono/swagger-ui";

import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { cache } from 'hono/cache';

import routes from './routes'
import { rateLimit } from './util/ratelimit';

import * as packageJson from '../package.json'
import { bearerAuth } from 'hono/bearer-auth';

const app = new Hono()

app.route('/v1', routes)

// Middleware
if (packageJson.development) {
    app.use('*', bearerAuth({
        verifyToken: (token, c) => {
            return token === c.env.DEVEOPMENT_TOKEN
        },
        noAuthenticationHeaderMessage: "Mantle is currently in development mode. Please provide the development token.",
        invalidTokenMessage: "Invalid development token provided."
    }))
}

app.use(logger()) // Logger middleware
app.use('/v1/*', cache({ // Cache middleware
    cacheName: 'earth-app-cache',
    cacheControl: 'public, max-age=60, s-maxage=60',
    vary: ['Accept-Encoding', 'Authorization'],
}))
app.use('/v1/*', (c, next) => rateLimit(c)(c, next)) // Rate limiting middleware
app.use('/v1/*', cors({ // CORS middleware
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
}))

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
                    url: "https://localhost:8787",
                    description: "Local Server"
                },
                {
                    url: "https://api.earth-app.com",
                    description: "Production Server"
                },
                {
                    url: "*-mantle.gmitch215.workers.dev",
                    description: "Preview URLs"
                }
            ]
        }
    })
)

app.get(
    '/',
    swaggerUI({
        title: packageJson.name,
        url: '/openapi',
    })
)

export default app
