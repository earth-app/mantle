import z from "zod"
import "zod-openapi/extend"

export const text = z.string().openapi({ example: "Hello World" })

export const error = z.object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
})

export const info = z.object({
    name: z.string().openapi({ example: "mantle" }),
    title: z.string().openapi({ example: "Earth App" }),
    version: z.string().openapi({ example: "1.0.0" }),
    description: z.string().openapi({ example: "Backend API for The Earth App" }),
    date: z.string().openapi({ example: "2025-05-11" })
})