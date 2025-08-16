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
	const results: T[] = [];

	let currentOffset = offset;
	let remainingLimit = limit;

	for (let i = 0; i < dbs.length && remainingLimit > 0; i++) {
		const currentDB = dbs[i].db;

		try {
			const countQuery = search
				? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${searchParam} LIKE ?`
				: `SELECT COUNT(*) as count FROM ${tableName}`;

			let countResult;
			if (search) {
				countResult = await currentDB.prepare(countQuery).bind(`%${search}%`).first<{ count: number }>();
			} else {
				countResult = await currentDB.prepare(countQuery).first<{ count: number }>();
			}

			if (!countResult || countResult.count === 0) continue;

			const shardCount = countResult.count;

			if (currentOffset >= shardCount) {
				currentOffset -= shardCount;
				continue;
			}

			// Calculate how many records to fetch from this shard
			const fetchLimit = Math.min(remainingLimit, shardCount - currentOffset);
			const dataQuery = search
				? `SELECT * FROM ${tableName} WHERE ${searchParam} LIKE ? ORDER BY ${orderParam} LIMIT ? OFFSET ?`
				: `SELECT * FROM ${tableName} ORDER BY ${orderParam} LIMIT ? OFFSET ?`;

			let dataResults;
			if (search) {
				dataResults = await currentDB.prepare(dataQuery).bind(`%${search}%`, fetchLimit, currentOffset).all<T>();
			} else {
				dataResults = await currentDB.prepare(dataQuery).bind(fetchLimit, currentOffset).all<T>();
			}

			if (!dataResults.success) {
				throw new DBError(`Failed to fetch data from ${tableName} in shard ${dbs[i].name}: ${dataResults.error}`);
			}

			results.push(...dataResults.results);
			remainingLimit -= dataResults.results.length;

			currentOffset = 0;
		} catch (error) {
			console.error(`Error querying shard ${dbs[i].name}:`, error);
			continue;
		}
	}

	return results;
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
	const results: T[] = [];

	let currentOffset = offset;
	let remainingLimit = limit;

	for (let i = 0; i < dbs.length && remainingLimit > 0; i++) {
		const currentDB = dbs[i].db;

		try {
			let whereClause = `${filterField} = ?`;
			const params: (string | number)[] = [filterValue];

			if (search && searchParam) {
				whereClause += ` AND ${searchParam} LIKE ?`;
				params.push(`%${search}%`);
			}

			// Get count for this shard
			const countQuery = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereClause}`;
			let countResult = await currentDB
				.prepare(countQuery)
				.bind(...params)
				.first<{ count: number }>();

			if (!countResult || countResult.count === 0) continue;

			const shardCount = countResult.count;
			if (currentOffset >= shardCount) {
				currentOffset -= shardCount;
				continue;
			}

			const fetchLimit = Math.min(remainingLimit, shardCount - currentOffset);
			const dataQuery = `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY ${orderParam} LIMIT ? OFFSET ?`;
			const queryParams = [...params, fetchLimit, currentOffset];

			let dataResults = await currentDB
				.prepare(dataQuery)
				.bind(...queryParams)
				.all<T>();

			if (!dataResults.success) {
				throw new DBError(`Failed to fetch data from ${tableName} in shard ${dbs[i].name}: ${dataResults.error}`);
			}

			results.push(...dataResults.results);
			remainingLimit -= dataResults.results.length;

			currentOffset = 0;
		} catch (error) {
			console.error(`Error querying shard ${dbs[i].name}:`, error);
			continue;
		}
	}

	return results;
}

export async function getCountInTable(
	bindings: Bindings,
	tableName: string,
	searchParam: string = 'id',
	search: string = ''
): Promise<number> {
	await init(bindings);
	const dbs = getSortedShards();
	let totalCount = 0;

	for (let i = 0; i < dbs.length; i++) {
		const currentDB = dbs[i].db;

		try {
			const countQuery = search
				? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${searchParam} LIKE ?`
				: `SELECT COUNT(*) as count FROM ${tableName}`;

			let countResult;
			if (search) {
				countResult = await currentDB.prepare(countQuery).bind(`%${search}%`).first<{ count: number }>();
			} else {
				countResult = await currentDB.prepare(countQuery).first<{ count: number }>();
			}

			if (countResult && countResult.count) {
				totalCount += countResult.count;
			}
		} catch (error) {
			console.error(`Error getting count from shard ${dbs[i].name}:`, error);
			continue;
		}
	}

	return totalCount;
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
	await init(bindings);
	const dbs = getSortedShards();
	const results: T[] = [];

	let currentOffset = offset;
	let remainingLimit = limit;

	for (let i = 0; i < dbs.length && remainingLimit > 0; i++) {
		const currentDB = dbs[i].db;

		try {
			let whereClause = `WHERE ${filterField} = ?`;
			let params = [filterValue];

			if (search && searchParam) {
				whereClause += ` AND ${searchParam} LIKE ?`;
				params.push(`%${search}%`);
			}

			const countQuery = `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`;
			const countResult = await currentDB
				.prepare(countQuery)
				.bind(...params)
				.first<{ count: number }>();

			if (!countResult || countResult.count === 0) {
				continue; // Skip empty shards
			}

			const shardCount = countResult.count;

			if (currentOffset >= shardCount) {
				currentOffset -= shardCount;
				continue;
			}

			// Calculate how many records to fetch from this shard
			const fetchLimit = Math.min(remainingLimit, shardCount - currentOffset);
			const dataQuery = `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${orderParam} LIMIT ? OFFSET ?`;
			const dataParams = [...params, fetchLimit, currentOffset];
			const dataResults = await currentDB
				.prepare(dataQuery)
				.bind(...dataParams)
				.all<T>();

			if (!dataResults.success) {
				throw new DBError(`Failed to fetch data from ${tableName} in shard ${dbs[i].name}: ${dataResults.error}`);
			}

			results.push(...dataResults.results);
			remainingLimit -= dataResults.results.length;

			currentOffset = 0;
		} catch (error) {
			console.error(`Error querying shard ${dbs[i].name}:`, error);
			continue;
		}
	}

	return results;
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
	let totalCount = 0;

	for (let i = 0; i < dbs.length; i++) {
		const currentDB = dbs[i].db;

		try {
			let whereClause = `${filterField} = ?`;
			const params: (string | number)[] = [filterValue];

			if (search && searchParam) {
				whereClause += ` AND ${searchParam} LIKE ?`;
				params.push(`%${search}%`);
			}

			const countQuery = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereClause}`;
			let countResult = await currentDB
				.prepare(countQuery)
				.bind(...params)
				.first<{ count: number }>();

			if (countResult && countResult.count) {
				totalCount += countResult.count;
			}
		} catch (error) {
			console.error(`Error getting count from shard ${dbs[i].name}:`, error);
			continue;
		}
	}

	return totalCount;
}
