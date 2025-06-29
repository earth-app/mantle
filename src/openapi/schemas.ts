import z from "zod"
import "zod-openapi/extend"

import { LoginUser, User } from "../types/users"
import { resolver } from "hono-openapi/zod"

// Root Types
export function error(code: number, message: string) {
    return z.object({
        code: z.number().openapi({ example: code }),
        message: z.string().openapi({ example: message }),
    })
}

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
export const username = z.string().min(4).max(20).openapi({ example: "johndoe" })
export const password = z.string().min(8).max(100).openapi({ example: "password123" })
export const email = z.string().email().openapi({ example: "me@company.com" })

// Objects

/// Request Objects
export const userCreate = z.object({
    username: username,
    password: password,
    email: email,
})

export const userUpdate = z.object({
    username: username.optional(),
    email: email.optional(),
    firstName: z.string().min(1).max(30).optional(),
    lastName: z.string().min(1).max(30).optional(),
}).openapi({
    example: {
        username: "johndoe",
        email: "new@email.com",
        firstName: "John",
        lastName: "Doe",
    }
})

/// Return Objects
export const user = z.custom<User>().openapi({
    example: {
        id: "eb9137b1272938",
        username: "johndoe",
        created_at: new Date(),
        updated_at: new Date(),
        last_login: new Date(),
        account: {
            type: "com.earthapp.account.Account",
            id: "account123",
            username: "johndoe",
            email: "account@gmail.com",
            country: "US",
            phoneNumber: 1234567890,
        }
    }
})
export const users = z.array(user)
export const loginResponse = z.custom<LoginUser>().openapi({
    example: {
        id: "eb9137b1272938",
        username: "johndoe",
        session_token: "abc123xyz456",
    }
})

// Reponse Schemas

export const badRequest = {
    description: "Bad request",
    content: {
        'application/json': {
            schema: resolver(error(400, "Bad Request")),
        }
    }
}

export const unauthorized = {
    description: "Unauthorized",
    content: {
        'application/json': {
            schema: resolver(error(401, "Unauthorized")),
        }
    }
}

export const forbidden = {
    description: "Forbidden",
    content: {
        'application/json': {
            schema: resolver(error(403, "Forbidden")),
        }
    }
}