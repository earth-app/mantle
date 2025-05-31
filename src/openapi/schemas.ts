import z from "zod"
import "zod-openapi/extend"

// Root Types
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

// String Types
export const text = z.string().openapi({ example: "Hello World" })
export const id = z.string().uuid().openapi({ example: "eb9137b1272938" })
export const username = z.string().min(3).max(20).openapi({ example: "johndoe" })
export const password = z.string().min(8).max(100).openapi({ example: "password123" })
export const email = z.string().email().openapi({ example: "me@company.com" })

// Objects

/// Request Objects
export const userCreate = z.object({
    username: username,
    password: password,
    email: email,
})

/// Return Objects
const returnObject = z.object({
    type: text.openapi({ example: "com.earthapp.Exportable" })
})

export const user = returnObject.extend({
    id: id,
    username: username,
    email: email,
})