import { WorkersKVStore } from "@hono-rate-limiter/cloudflare"
import { rateLimiter } from "hono-rate-limiter"
import { Context } from "hono"

export function rateLimit(c: Context) {
    return rateLimiter({
        windowMs: 30 * 60 * 1000, // 30 minutes
        limit: 100, // 100 requests per 30 minutes
        standardHeaders: "draft-6",
        keyGenerator: (c) => c.req.header("cf-connecting-ip") || "",
        store: new WorkersKVStore({ namespace: c.env.KV }),
        skip: (c) => {
            const authHeader = c.req.header("Authorization")
            return !authHeader || !authHeader.startsWith("Bearer ")
        }
    })
}