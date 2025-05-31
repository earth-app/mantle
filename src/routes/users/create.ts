import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { resolver } from "hono-openapi/zod"
import type { OpenAPIV3 } from "openapi-types"
import zodToJsonSchema from "zod-to-json-schema"

import Bindings from "../../bindings"
import * as schemas from "../../openapi/schemas"
import users from "../../util/users"
import { bearerAuthMiddleware } from "../../util/authentication"

const createUser = new Hono<{ Bindings: Bindings }>()

createUser.post(
    '/',
    describeRoute({
        summary: "Create a new user",
        description: "Creates a new user within the Earth App",
        requestBody: {
            description: "User object",
            required: true,
            content: {
                'application/json': {
                    schema: zodToJsonSchema(schemas.userCreate) as OpenAPIV3.SchemaObject
                }
            }
        },
        responses: {
            200: {
                description: "User created successfully",
                content: {
                    'application/json': {
                        schema: resolver(schemas.user),
                    }
                }
            },
            400: {
                description: "Bad request",
                content: {
                    'application/json': {
                        schema: resolver(schemas.error),
                    }
                }
            }
        },
        tags: ["Users"],
    }),
    async (c) => {
        const { username, email, password } = await c.req.json()
        if (!username || !email || !password)
            return c.json({
                code: 400,
                message: "Missing required fields"
            }, 400)

        const existing = await users.getUserByUsername(username, c.env)
        if (existing)
            return c.json({
                code: 400,
                message: "User already exists"
            }, 400)

        const user = await users.createUser(username, (user) => {
            user.email = email
        })

        const result = await users.saveUser(user, password, c.env)
        if (!result)
            return c.json({
                code: 400,
                message: "Failed to create user"
            }, 400)
        
        if (result.error)
            return c.json({
                code: 400,
                message: result.error
            })

        return c.json(JSON.parse(user.toJson()))
    }
)

export default createUser