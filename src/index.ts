import { Hono } from 'hono'
import { openAPISpecs } from 'hono-openapi'
import { swaggerUI } from "@hono/swagger-ui";
import routes from './routes'

const app = new Hono()

app.route('/v1', routes)

// OpenAPI & Swagger UI
app.get(
    '/openapi',
    openAPISpecs(app, {
        documentation: {
            info: {
                title: 'mantle',
                version: '1.0.0',
                description: 'Backend API for The Earth App'
            },
            servers: [
                {
                    url: "https://localhost:8787",
                    description: "Local Server"
                },
                {
                    url: "https://api.earth-app.com",
                    description: "Production Server"
                }
            ]
        }
    })
)

app.get(
    '/',
    swaggerUI({
        title: 'mantle',
        url: '/openapi',
    })
)

export default app
