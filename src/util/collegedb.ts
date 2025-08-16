import { CollegeDBConfig, D1Region, initializeAsync } from '@earth-app/collegedb';
import Bindings from '../bindings';

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
		disableAutoMigration: false,
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
