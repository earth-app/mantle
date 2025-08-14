import { Ai, Fetcher, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

type Bindings = {
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

	// Databases
	DB_PRIMARY: D1Database;

	DB_EN1: D1Database;
	DB_EN2: D1Database;
	DB_EN3: D1Database;
	DB_EN4: D1Database;
	DB_WN1: D1Database;
	DB_WN2: D1Database;

	DB_WE1: D1Database;
	DB_EE1: D1Database;

	DB_AP1: D1Database;
	DB_OC1: D1Database;
};

export default Bindings;
