import z from "zod"
import "zod-openapi/extend"

export const text = z.string().openapi({ example: "Hello World" })

export const error = z.object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
})