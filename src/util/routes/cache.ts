import { KVNamespace } from '@cloudflare/workers-types';
import { ValidationError } from '../../types/errors';

const CACHE_TTL = 60 * 60 * 4000; // 4 hours in milliseconds

export async function cache(id: string, value: any, kv: KVNamespace) {
	if (!value) return;

	// Handle Uint8Array serialization properly
	const serializedValue = JSON.stringify(value, (key, val) => {
		if (val instanceof Uint8Array) {
			return { __type: 'Uint8Array', data: Array.from(val) };
		}
		return val;
	});
	return kv.put(id, serializedValue, { metadata: { date: Date.now() } });
}

export async function getCache<T>(id: string, kv: KVNamespace): Promise<[T, number] | null> {
	const result = await kv.getWithMetadata(id);
	if (!result) return null;
	if (!result.value) return null;

	try {
		// Parse with proper Uint8Array deserialization
		const parsed = JSON.parse(result.value as string, (key, val) => {
			if (val && typeof val === 'object' && val.__type === 'Uint8Array') {
				return new Uint8Array(val.data);
			}
			return val;
		}) as T;
		const metadata = result.metadata as { date: number } | null;
		return [parsed, metadata?.date || Date.now()];
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
		cache(id, obj, kv);
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
