import { Ai, D1Database, KVNamespace } from "@cloudflare/workers-types"

type Bindings = {
    DB: D1Database
    earth_app: KVNamespace
    ANONYMOUS_RATE_LIMIT: any
    AUTH_RATE_LIMIT: any
    AI: Ai

    // Secrets
    KEK: string
    LOOKUP_HMAC_KEY: string
    DEVEOPMENT_TOKEN: string
    ADMIN_API_KEY: string
}

export default Bindings