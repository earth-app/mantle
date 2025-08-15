import { KVNamespace } from '@cloudflare/workers-types';
import Bindings from '../../bindings';
import { ValidationError } from '../../types/errors';

const CACHE_TTL = 60 * 60 * 4; // 4 hours in seconds

export async function cache(id: string, value: any, kv: KVNamespace) {
	if (!value) return;

	try {
		// Handle Uint8Array serialization properly
		const serializedValue = JSON.stringify(value, (_, val) => {
			if (val instanceof Uint8Array) {
				return { __type: 'Uint8Array', data: Array.from(val) };
			}
			return val;
		});
		return kv.put(id, serializedValue, { expirationTtl: CACHE_TTL });
	} catch (error) {
		console.error(`Failed to cache data for ${id}:`, error);
		throw error;
	}
}

export async function healthCheck(bindings: Bindings): Promise<boolean> {
	try {
		await bindings.KV_CACHE.list({ prefix: 'cache:', limit: 1 });
		return true;
	} catch (error) {
		console.error(`Cache KV health check failed: ${error}`);
		return false;
	}
}

export async function getCache<T>(id: string, kv: KVNamespace): Promise<T | null> {
	const result = await kv.get(id);
	if (!result) return null;

	try {
		// Parse with proper Uint8Array deserialization
		const parsed = JSON.parse(result as string, (_, val) => {
			if (val && typeof val === 'object' && val.__type === 'Uint8Array') {
				return new Uint8Array(val.data);
			}
			return val;
		}) as T;

		return parsed;
	} catch (e) {
		return null;
	}
}

export async function checkCacheExists(id: string, kv: KVNamespace): Promise<boolean> {
	const result = await kv.getWithMetadata(id);
	return result.value !== null;
}

export async function tryCache<T>(id: string, kv: KVNamespace, fallback: () => Promise<T>): Promise<T> {
	if (!id) throw new ValidationError('Cache ID cannot be empty');
	if (!kv) throw new Error('KV Namespace is undefined');

	const result = await getCache<T>(id, kv);
	if (result) {
		return result;
	} else {
		// Cache miss, call fallback
		const obj = await fallback();
		cache(id, obj, kv).catch((err) => {
			console.error(`Failed to cache data for ${id}:`, err);
		});
		return obj;
	}
}

export async function clearCache(id: string, kv: KVNamespace): Promise<void> {
	try {
		await kv.delete(id);
	} catch (err) {
		console.error(`Failed to clear cache for ${id}:`, err);
	}
}

export async function clearCachePrefix(prefix: string, kv: KVNamespace): Promise<void> {
	try {
		let list = await kv.list({ prefix });
		for (const key of list.keys) await kv.delete(key.name);
		while (list.list_complete === false) {
			for (const key of list.keys) await kv.delete(key.name);
			list = await kv.list({ prefix, cursor: list.cursor });
		}
	} catch (err) {
		console.error(`Failed to clear cache for prefix ${prefix}:`, err);
	}
}
