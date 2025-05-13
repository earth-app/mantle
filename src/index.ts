import { Hono } from 'hono'
import { openAPISpecs } from 'hono-openapi'
import { swaggerUI } from "@hono/swagger-ui";
import routes from './routes'

import * as packageJson from '../package.json'

const app = new Hono()

app.route('/v1', routes)

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
