import { Hono } from "hono";

import { describeRoute } from "hono-openapi"
import { resolver } from "hono-openapi/zod"
import * as schemas from "../../openapi/schemas"
import * as tags from "../../openapi/tags"

import Bindings from "../../bindings";
import { getUserById } from "../../util/users";
import { getOwnerOfToken } from "../../util/authentication";

const user = new Hono<{ Bindings: Bindings }>()

// Get User by ID or Current User
user.get(
    '/',
    describeRoute({
        summary: "Gets a user",
        description: "Gets the user by ID or based on the provided Bearer token.",
        security: [{ BearerAuth: [] }],
        responses: {
            200: {
                description: "User retrieved successfully",
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
        tags: [tags.USERS],
    }),
    async (c) => {
        const byId = c.req.param('id')
        if (byId) {
            const user = await getUserById(byId, c.env)
            if (!user) {
                return c.json({
                    code: 404,
                    message: "User not found"
                }, 404)
            }

            return c.json(user.public)
        }

        const bearerToken = c.req.header('Authorization')
        if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
            return c.json({
                code: 401,
                message: "Unauthorized"
            }, 401)
        }

        const token = bearerToken.slice(7)
        const user = await getOwnerOfToken(token, c.env)
        if (!user) {
            return c.json({
                code: 401,
                message: "Unauthorized"
            }, 401)
        }

        return c.json(user.public)
    }
)

export default user