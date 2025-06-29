import { Hono } from "hono";

import { describeRoute } from "hono-openapi"
import { resolver } from "hono-openapi/zod"
import type { OpenAPIV3 } from "openapi-types"
import zodToJsonSchema from "zod-to-json-schema"
import * as schemas from "../../openapi/schemas"
import * as tags from "../../openapi/tags"

import Bindings from "../../bindings";
import { deleteUser, getUserById, patchUser } from "../../util/users";
import { bearerAuthMiddleware, getOwnerOfToken } from "../../util/authentication";
import { UserObject } from "../../types/users";
import { com } from "@earth-app/ocean";

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
            400: schemas.badRequest,
            401: schemas.unauthorized,
            403: schemas.forbidden,
            404: {
                description: "User not found",
                content: {
                    'application/json': {
                        schema: resolver(schemas.error(404, "User not found")),
                    }
                }
            }
        },
        tags: [tags.USERS],
    }),
    async (c) => {
        const byId = c.req.param('id')

        let user: UserObject | null;
        if (byId) {
            user = await getUserById(byId, c.env)
            if (!user) {
                return c.json({
                    code: 404,
                    message: "User not found"
                }, 404)
            }
        } else {
            const bearerToken = c.req.header('Authorization')
            if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
                return c.json({
                    code: 401,
                    message: "Unauthorized"
                }, 401)
            }

            const token = bearerToken.slice(7)
            
            user = await getOwnerOfToken(token, c.env)
            if (!user) {
                return c.json({
                    code: 401,
                    message: "Unauthorized"
                }, 401)
            }
        }

        if (!user) {
            return c.json({
                code: 404,
                message: "User not found"
            }, 404)
        }

        switch (user.account.visibility.name.toLowerCase()) {
            // Unlisted - Requires authentication
            case 'unlisted': {
                if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
                    return c.json({
                        code: 403,
                        message: "Forbidden: This user is unlisted and requires authentication to view."
                    }, 403)
                }
                break;
            }
            // Private - Admin only
            case 'private': {
                if (!c.req.header('Authorization') || !c.req.header('Authorization')?.startsWith('Bearer ')) {
                    return c.json({
                        code: 403,
                        message: "Forbidden: This user is private."
                    }, 403)
                }

                const token = c.req.header('Authorization')!.slice(7)
                if (token !== c.env.ADMIN_API_KEY) {
                    return c.json({
                        code: 403,
                        message: "Forbidden: You do not have permission to view this user."
                    }, 403)
                }

                break;
            }
        }

        return c.json(user.public)
    }
)

// Patch User by ID or Current User
user.patch(
    '/',
    describeRoute({
        summary: "Updates a user",
        description: "Updates the user by ID or based on the provided Bearer token.",
        security: [{ BearerAuth: [] }],
        requestBody: {
            description: "User object partial",
            required: true,
            content: {
                'application/json': {
                    schema: zodToJsonSchema(schemas.userUpdate) as OpenAPIV3.SchemaObject
                }
            }
        },
        responses: {
            200: {
                description: "User updated successfully",
                content: {
                    'application/json': {
                        schema: resolver(schemas.user),
                    }
                }
            },
            400: schemas.badRequest,
            401: schemas.unauthorized,
            403: schemas.forbidden,
            404: {
                description: "User not found",
                content: {
                    'application/json': {
                        schema: resolver(schemas.error(404, "User not found")),
                    }
                }
            }
        },
        tags: [tags.USERS],
    }),
    bearerAuthMiddleware(),
    async (c) => {
        const rawBody = await c.req.text()
        if (!rawBody) {
            return c.json({
                code: 400,
                message: "Request body cannot be empty"
            }, 400)
        }

        let data: Partial<com.earthapp.account.Account> = await c.req.json()
        if (!data || typeof data !== 'object') {
            return c.json({
                code: 400,
                message: "Invalid request body"
            }, 400)
        }

        const byId = c.req.param('id')
        const bearerToken = c.req.header('Authorization')
        if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
            return c.json({
                code: 401,
                message: "Unauthorized"
            }, 401)
        }

        const token = bearerToken.slice(7)

        let user: UserObject | null;
        if (byId) {
            user = await getUserById(byId, c.env)
            if (!user) {
                return c.json({
                    code: 404,
                    message: "User not found"
                }, 404)
            }

            if (token !== c.env.ADMIN_API_KEY) {
                return c.json({
                    code: 403,
                    message: "Forbidden: You do not have permission to update this user."
                }, 403)
            }
        } else {
            user = await getOwnerOfToken(token, c.env)
            if (!user) {
                return c.json({
                    code: 401,
                    message: "Unauthorized"
                }, 401)
            }
        }

        if (!user) {
            return c.json({
                code: 404,
                message: "User not found"
            }, 404)
        }

        if (data.type || data.id) {
            data = {
                ...data,
                type: undefined, // Prevent type changes
                id: undefined // Prevent ID changes
            }
        }

        // Update user properties
        await patchUser(user.account, data, c.env)
        const returned = (await getUserById(user.account.id, c.env))!.public
        
        return c.json(returned, 200)
    }
)
user.delete(
    '/',
    describeRoute({
        summary: "Deletes a user",
        description: "Deletes the user by ID or based on the provided Bearer token.",
        security: [{ BearerAuth: [] }],
        responses: {
            204: {
                description: "User deleted successfully"
            },
            400: schemas.badRequest,
            401: schemas.unauthorized,
            403: schemas.forbidden,
            404: {
                description: "User not found",
                content: {
                    'application/json': {
                        schema: resolver(schemas.error(404, "User not found")),
                    }
                }
            }
        },
        tags: [tags.USERS],
    }),
    bearerAuthMiddleware(),
    async (c) => {
        const byId = c.req.param('id')
        const bearerToken = c.req.header('Authorization')
        if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
            return c.json({
                code: 401,
                message: "Unauthorized"
            }, 401)
        }

        const token = bearerToken.slice(7)

        let user: UserObject | null;
        if (byId) {
            user = await getUserById(byId, c.env)
            if (!user) {
                return c.json({
                    code: 404,
                    message: "User not found"
                }, 404)
            }

            if (token !== c.env.ADMIN_API_KEY) {
                return c.json({
                    code: 403,
                    message: "Forbidden: You do not have permission to delete this user."
                }, 403)
            }
        } else {
            user = await getOwnerOfToken(token, c.env)
            if (!user) {
                return c.json({
                    code: 401,
                    message: "Unauthorized"
                }, 401)
            }
        }

        if (!user) {
            return c.json({
                code: 404,
                message: "User not found"
            }, 404)
        }

        // Delete the user
        await deleteUser(user.account.id, c.env)

        return c.body(null, 204)
    }
)

export default user