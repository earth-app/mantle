import { KVNamespace } from '@cloudflare/workers-types';

const CACHE_TTL = 60 * 60 * 4000; // 4 hours in milliseconds

export async function cache(id: string, value: any, kv: KVNamespace) {
	return kv.put(id, JSON.stringify(value), { metadata: { date: Date.now() } });
}

export async function getCache<T>(id: string, kv: KVNamespace): Promise<[T, number] | null> {
	const result = await kv.getWithMetadata<{ date: number }>(id);
	if (!result.value) return null;

	try {
		return [JSON.parse(result.value) as T, result.metadata?.date || Date.now()];
	} catch (e) {
		return null;
	}
}

export async function checkCacheExists(id: string, kv: KVNamespace): Promise<boolean> {
	const result = await kv.getWithMetadata(id);
	return result.value !== null;
}

export async function tryCache<T>(id: string, kv: KVNamespace, fallback: () => Promise<T>): Promise<T> {
	const result = await getCache<T>(id, kv);
	if (result) {
		const time = result[1];
		const value = result[0];

		if (Date.now() - time < CACHE_TTL) {
			return value;
		} else {
			// Cache expired
			kv.delete(id).catch((err) => {
				console.error(`Failed to delete expired cache for ${id}:`, err);
			});

			const obj = await fallback();
			cache(id, obj, kv);
			return obj;
		}
	} else {
		// Cache miss, call fallback
		const obj = await fallback();
		await cache(id, obj, kv);
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
