import { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Bindings = {
	DB: D1Database;
	KV: KVNamespace;
	ANONYMOUS_RATE_LIMIT: any;
	AUTH_RATE_LIMIT: any;

	// Secrets
	KEK: string;
	LOOKUP_HMAC_KEY: string;
	ADMIN_API_KEY: string;
};

export default Bindings;
