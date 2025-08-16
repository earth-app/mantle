import { CollegeDBConfig, D1Region, initializeAsync, ShardLocation } from '@earth-app/collegedb';
import Bindings from '../bindings';
import { DBError } from '../types/errors';

export const collegeDBConfig = (bindings: Bindings): CollegeDBConfig =>
	({
		kv: bindings.KV,
		shards: {
			primary: bindings.DB_PRIMARY,
			en1: bindings.DB_EN1,
			en2: bindings.DB_EN2,
			en3: bindings.DB_EN3,
			en4: bindings.DB_EN4,
			wn1: bindings.DB_WN1,
			wn2: bindings.DB_WN2,

			we1: bindings.DB_WE1,
			ee1: bindings.DB_EE1,

			ap1: bindings.DB_AP1,
			oc1: bindings.DB_OC1
		},
		strategy: {
			read: 'location',
			write: 'hash'
		},
		hashShardMappings: false,
		// Higher priority = more preferred
		targetRegion: currentRegion ?? 'enam',
		shardLocations: {
			primary: { region: 'enam', priority: 3 },
			en1: { region: 'enam', priority: 2 },
			en2: { region: 'enam', priority: 1 },
			en3: { region: 'enam', priority: 1 },
			en4: { region: 'enam', priority: 1 },
			wn1: { region: 'wnam', priority: 2 },
			wn2: { region: 'wnam', priority: 1 },

			we1: { region: 'weur', priority: 2 },
			ee1: { region: 'eeur', priority: 2 },

			ap1: { region: 'apac', priority: 2 },
			oc1: { region: 'oc', priority: 2 }
		},
		disableAutoMigration: true,
		debug: false
	}) satisfies CollegeDBConfig;

export let currentRegion: D1Region | undefined = undefined;
export let collegeDB: CollegeDBConfig;

export async function init(bindings: Bindings) {
	if (collegeDB) return;
	collegeDB = collegeDBConfig(bindings);
	await initializeAsync(collegeDB);
}

export async function setCurrentRegion(region: D1Region) {
	if (currentRegion) return;
	currentRegion = region;
}

// based on internal CollegeDB logic
const regionCoords: Record<D1Region, { lat: number; lon: number }> = {
	wnam: { lat: 37.7749, lon: -122.4194 }, // San Francisco
	enam: { lat: 40.7128, lon: -74.006 }, // New York
	weur: { lat: 51.5074, lon: -0.1278 }, // London
	eeur: { lat: 52.52, lon: 13.405 }, // Berlin
	apac: { lat: 35.6762, lon: 139.6503 }, // Tokyo
	oc: { lat: -33.8688, lon: 151.2093 }, // Sydney
	me: { lat: 25.2048, lon: 55.2708 }, // Dubai
	af: { lat: -26.2041, lon: 28.0473 } // Johannesburg
};
const R = 6371; // Earth's radius in kilometers
const SHARD_BATCH_SIZE = 10; // how many shards to query at once for list endpoints

export function getSortedShards() {
	if (!collegeDB || !currentRegion)
		return Object.entries(collegeDB.shards).map(([name, db]) => ({ name, db, priority: 0, distance: Infinity }));

	const currentCoords = regionCoords[currentRegion];

	const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLon = ((lon2 - lon1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	};

	const shardEntries = Object.entries(collegeDB.shards).map(([name, db]) => {
		const location = collegeDB.shardLocations![name]! as ShardLocation;
		if (!location || !location.region || !regionCoords[location.region]) {
			return { name, db, priority: 0, distance: Infinity }; // Fallback for missing locations
		}

		const coords = regionCoords[location.region];
		const distance = calculateDistance(currentCoords.lat, currentCoords.lon, coords.lat, coords.lon);

		return {
			name,
			db,
			priority: location.priority || 0,
			distance
		};
	});

	// Sort by priority (descending), then by distance (ascending)
	shardEntries.sort((a, b) => {
		if (a.priority !== b.priority) {
			return b.priority - a.priority;
		}
		return a.distance - b.distance;
	});

	return shardEntries;
}

// Helper to run COUNT(*) in parallel across shards
async function parallelCount(
	dbs: ReturnType<typeof getSortedShards>,
	tableName: string,
	whereClause?: string,
	params: (string | number)[] = []
) {
	const sql = whereClause
		? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereClause}`
		: `SELECT COUNT(*) as count FROM ${tableName}`;
	const counts = await Promise.all(
		dbs.map(async (s) => {
			try {
				const res = await s.db
					.prepare(sql)
					.bind(...params)
					.first<{ count: number }>();
				return res?.count ?? 0;
			} catch (e) {
				console.error(`Error getting count from shard ${s.name}:`, e);
				return 0;
			}
		})
	);
	return counts;
}

// Helper to run COUNT(*) across shards with early stopping when threshold reached
async function batchedCountUntil(
	dbs: ReturnType<typeof getSortedShards>,
	tableName: string,
	whereClause: string | undefined,
	params: (string | number)[] = [],
	threshold: number, // stop when cumulative count >= threshold
	limitForBatching: number
) {
	let total = 0;
	const counts: number[] = [];
	const batchSize = Math.min(SHARD_BATCH_SIZE, dbs.length);
	for (let i = 0; i < dbs.length; i += batchSize) {
		const batch = dbs.slice(i, i + batchSize);
		const sql = whereClause
			? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereClause}`
			: `SELECT COUNT(*) as count FROM ${tableName}`;
		const batchCounts = await Promise.all(
			batch.map(async (s) => {
				try {
					const res = await s.db
						.prepare(sql)
						.bind(...params)
						.first<{ count: number }>();
					return res?.count ?? 0;
				} catch (e) {
					console.error(`Error getting count from shard ${s.name}:`, e);
					return 0;
				}
			})
		);
		for (let j = 0; j < batchCounts.length; j++) {
			const c = batchCounts[j] ?? 0;
			counts[i + j] = c;
			total += c;
		}
		if (total >= threshold) break;
	}

	// Fill any missing with 0 to keep array length consistent
	for (let k = 0; k < dbs.length; k++) if (counts[k] === undefined) counts[k] = 0;
	return counts;
}

// Helper to fetch data from selected shards in parallel maintaining shard order
async function parallelFetch<T>(
	dbs: ReturnType<typeof getSortedShards>,
	tableName: string,
	orderParam: string,
	perShard: { index: number; limit: number; offset: number; whereClause?: string; params?: (string | number)[] }[]
): Promise<T[]> {
	const results = await Promise.all(
		perShard.map(async ({ index, limit, offset, whereClause, params }) => {
			const shard = dbs[index];
			const base = whereClause
				? `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY ${orderParam} LIMIT ? OFFSET ?`
				: `SELECT * FROM ${tableName} ORDER BY ${orderParam} LIMIT ? OFFSET ?`;
			try {
				const stmt = shard.db.prepare(base);
				const bindParams: (string | number)[] = [];
				if (params && params.length) bindParams.push(...params);
				bindParams.push(limit, offset);
				const res = await stmt.bind(...bindParams).all<T>();
				if (!res.success) throw new DBError(`Failed to fetch from ${tableName} in shard ${shard.name}: ${res.error}`);
				return res.results as T[];
			} catch (e) {
				console.error(`Error querying shard ${shard.name}:`, e);
				return [] as T[];
			}
		})
	);

	// Preserve shard order as in perShard input, then flatten
	return results.flat();
}

// Helper to fetch top N rows from shards in batches with early stop, preserving shard priority order
async function fetchTopFromShards<T>(
	dbs: ReturnType<typeof getSortedShards>,
	tableName: string,
	orderParam: string,
	limit: number,
	whereClause?: string,
	params: (string | number)[] = []
): Promise<T[]> {
	let collected: T[] = [];
	const batchSize = Math.min(SHARD_BATCH_SIZE, dbs.length);
	for (let i = 0; i < dbs.length && collected.length < limit; i += batchSize) {
		const batch = dbs.slice(i, i + batchSize);
		const remaining = Math.max(0, limit - collected.length);
		// Allocate fairly across shards in this batch to minimize over-fetch
		const perShardLimit = Math.max(1, Math.ceil(remaining / batch.length));
		const sql = whereClause
			? `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY ${orderParam} LIMIT ? OFFSET 0`
			: `SELECT * FROM ${tableName} ORDER BY ${orderParam} LIMIT ? OFFSET 0`;
		const batchResults = await Promise.all(
			batch.map(async (s) => {
				try {
					const stmt = s.db.prepare(sql);
					const res = await stmt.bind(...params, perShardLimit).all<T>();
					if (!res.success) throw new DBError(`Failed to fetch from ${tableName} in shard ${s.name}: ${res.error}`);
					return res.results as T[];
				} catch (e) {
					console.error(`Error querying shard ${s.name}:`, e);
					return [] as T[];
				}
			})
		);
		for (const part of batchResults) {
			if (collected.length >= limit) break;
			collected = collected.concat(part);
		}
	}
	return collected.slice(0, limit);
}

export async function getAllInTable<T>(
	bindings: Bindings,
	tableName: string,
	orderParam: string,
	limit: number,
	offset: number,
	searchParam: string = 'id',
	search: string = ''
): Promise<T[]> {
	await init(bindings);
	const dbs = getSortedShards();

	// Fast path for first page: avoid global COUNT and avoid waiting for all shards
	if (offset === 0) {
		const whereClause = search ? `${searchParam} LIKE ?` : undefined;
		const params = search ? [`%${search}%`] : [];
		return fetchTopFromShards<T>(dbs, tableName, orderParam, limit, whereClause, params);
	}

	// General path: counts with early stop, then targeted fetches
	const where = search ? `${searchParam} LIKE ?` : undefined;
	const params = search ? [`%${search}%`] : [];
	const threshold = offset + limit;
	const counts = await batchedCountUntil(dbs, tableName, where, params, threshold, limit);

	let remainingOffset = offset;
	let remainingLimit = limit;
	const plan: { index: number; limit: number; offset: number; whereClause?: string; params?: (string | number)[] }[] = [];
	for (let i = 0; i < counts.length && remainingLimit > 0; i++) {
		const shardCount = counts[i] ?? 0;
		if (shardCount <= remainingOffset) {
			remainingOffset -= shardCount;
			continue;
		}
		const shardOffset = remainingOffset;
		const shardFetch = Math.min(remainingLimit, shardCount - shardOffset);
		plan.push({ index: i, limit: shardFetch, offset: shardOffset, whereClause: where, params });
		remainingOffset = 0;
		remainingLimit -= shardFetch;
	}
	if (plan.length === 0) return [];
	return parallelFetch<T>(dbs, tableName, orderParam, plan);
}

export async function getAllInTableWithFilter<T>(
	bindings: Bindings,
	tableName: string,
	orderParam: string,
	limit: number,
	offset: number,
	filterField: string,
	filterValue: string,
	searchParam?: string,
	search?: string
): Promise<T[]> {
	await init(bindings);
	const dbs = getSortedShards();

	const clauses: string[] = [];
	const params: (string | number)[] = [];
	clauses.push(`${filterField} = ?`);
	params.push(filterValue);
	if (search && searchParam) {
		clauses.push(`${searchParam} LIKE ?`);
		params.push(`%${search}%`);
	}
	const where = clauses.join(' AND ');

	if (offset === 0) {
		return fetchTopFromShards<T>(dbs, tableName, orderParam, limit, where, params);
	}

	const threshold = offset + limit;
	const counts = await batchedCountUntil(dbs, tableName, where, params, threshold, limit);
	let remainingOffset = offset;
	let remainingLimit = limit;
	const plan: { index: number; limit: number; offset: number; whereClause?: string; params?: (string | number)[] }[] = [];
	for (let i = 0; i < counts.length && remainingLimit > 0; i++) {
		const shardCount = counts[i] ?? 0;
		if (shardCount <= remainingOffset) {
			remainingOffset -= shardCount;
			continue;
		}
		const shardOffset = remainingOffset;
		const shardFetch = Math.min(remainingLimit, shardCount - shardOffset);
		plan.push({ index: i, limit: shardFetch, offset: shardOffset, whereClause: where, params });
		remainingOffset = 0;
		remainingLimit -= shardFetch;
	}
	if (plan.length === 0) return [];
	return parallelFetch<T>(dbs, tableName, orderParam, plan);
}

export async function getCountInTable(
	bindings: Bindings,
	tableName: string,
	searchParam: string = 'id',
	search: string = ''
): Promise<number> {
	await init(bindings);
	const dbs = getSortedShards();
	const where = search ? `${searchParam} LIKE ?` : undefined;
	const params = search ? [`%${search}%`] : [];
	const counts = await batchedCountUntil(dbs, tableName, where, params, Number.POSITIVE_INFINITY, 100);
	return counts.reduce((a, b) => a + (b ?? 0), 0);
}

export async function getAllInTableByField<T>(
	bindings: Bindings,
	tableName: string,
	orderParam: string,
	limit: number,
	offset: number,
	filterField: string,
	filterValue: string,
	searchParam?: string,
	search?: string
): Promise<T[]> {
	// Delegate to the unified filtered implementation
	return getAllInTableWithFilter<T>(bindings, tableName, orderParam, limit, offset, filterField, filterValue, searchParam, search);
}

export async function getCountInTableWithFilter(
	bindings: Bindings,
	tableName: string,
	filterField: string,
	filterValue: string,
	searchParam?: string,
	search?: string
): Promise<number> {
	await init(bindings);
	const dbs = getSortedShards();
	const clauses: string[] = [];
	const params: (string | number)[] = [];
	clauses.push(`${filterField} = ?`);
	params.push(filterValue);
	if (search && searchParam) {
		clauses.push(`${searchParam} LIKE ?`);
		params.push(`%${search}%`);
	}
	const where = clauses.join(' AND ');
	const counts = await parallelCount(dbs, tableName, where, params);
	return counts.reduce((a, b) => a + (b ?? 0), 0);
}
