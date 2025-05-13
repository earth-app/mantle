import { D1Database, KVNamespace } from "@cloudflare/workers-types"

type Bindings = {
    DB: D1Database
    KV: KVNamespace
}

export default Bindings