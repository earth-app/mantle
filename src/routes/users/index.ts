import { Hono } from "hono"

import { describeRoute } from "hono-openapi"
import { resolver } from "hono-openapi/zod"
import * as schemas from "../../openapi/schemas"
import * as tags from "../../openapi/tags"


// User Routes
import loginUser from './login'
import createUser from './create'
import user from './user'
import { bearerAuthMiddleware } from "../../util/authentication"
import { getUsers } from "../../util/routes/users"
import Bindings from "../../bindings"

// Implementation

const users = new Hono<{ Bindings: Bindings }>()

users.get(
    '/',
    describeRoute({
        summary: "Retrieve a paginated list of all users",
        description: "Gets a paginated list of all users in the Earth App.",
        security: [{ BasicAuth: [] }],
        responses: {
            200: {
                description: "List of users",
                content: {
                    'application/json': {
                        schema: resolver(schemas.users),
                    }
                }
            },
            400: schemas.badRequest
        },
        tags: [tags.USERS]
    }),
    async (c) => {
        const page = c.req.query('page') ? parseInt(c.req.query('page')!) : 1
        const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 25

        if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
            return c.json({
                code: 400,
                message: "Invalid pagination parameters"
            }, 400)
        }
        

        if (limit > 100) {
            return c.json({
                code: 400,
                message: "Limit cannot exceed 100"
            }, 400)
        }

        const users = (await getUsers(c.env, limit, page - 1)).map(user => user.public)
        return c.json(users, 200)
    }
)

users.route('/login', loginUser)

users.route('/create', createUser)

users.route('/current', user)
users.use('/current', bearerAuthMiddleware())

users.route('/:id', user)

export default users