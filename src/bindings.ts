import { D1Database, KVNamespace } from "@cloudflare/workers-types"

type Bindings = {
    DB: D1Database
    KV: KVNamespace

    // Secrets
    KEK: string
    LOOKUP_HMAC_KEY: string
    DEVEOPMENT_TOKEN: string
}

export default Bindings