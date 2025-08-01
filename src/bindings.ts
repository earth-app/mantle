import { Ai, D1Database, Fetcher, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

type Bindings = {
	DB: D1Database;
	KV: KVNamespace;
	KV_CACHE: KVNamespace;
	R2: R2Bucket;
	AI: Ai;
	ASSETS: Fetcher;
	ANONYMOUS_RATE_LIMIT: any;
	AUTH_RATE_LIMIT: any;

	// Secrets
	KEK: string;
	LOOKUP_HMAC_KEY: string;
	ADMIN_API_KEY: string;
};

export default Bindings;
