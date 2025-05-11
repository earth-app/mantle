import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { resolver } from "hono-openapi/zod"
import * as schemas from "../openapi/schemas"

const hello = new Hono()

hello.get(
    '/',
    describeRoute({
        summary: "A test route",
        description: "Say hello to the world",
        responses: {
            200: {
                description: "Hello World response",
                content: {
                    'text/plain': {
                        schema: resolver(schemas.text),
                    }
                }
            }
        },
        tags: ["General"]
    }), (c) => {
        return c.text('Hello World!')
    }
)

export default hello