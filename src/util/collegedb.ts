import { CollegeDBConfig, D1Region, initializeAsync } from '@earth-app/collegedb';
import Bindings from '../bindings';

export const collegeDBConfig = (bindings: Bindings, targetRegion?: D1Region): CollegeDBConfig =>
	({
		kv: bindings.KV,
		shards: {
			primary: bindings.DB_PRIMARY,
			en1: bindings.DB_EN1,
			en2: bindings.DB_EN2,
			en3: bindings.DB_EN3,
			wn1: bindings.DB_WN1,

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
		targetRegion: targetRegion ?? 'enam',
		shardLocations: {
			primary: { region: 'enam', priority: 3 },
			en1: { region: 'enam', priority: 2 },
			en2: { region: 'enam', priority: 1 },
			en3: { region: 'enam', priority: 1 },
			wn1: { region: 'wnam', priority: 1 },

			we1: { region: 'weur', priority: 2 },
			ee1: { region: 'eeur', priority: 1 },

			ap1: { region: 'apac', priority: 2 },
			oc1: { region: 'oc', priority: 1 }
		},
		disableAutoMigration: true,
		debug: false
	}) satisfies CollegeDBConfig;

export let collegeDB: CollegeDBConfig;

export async function init(bindings: Bindings) {
	if (collegeDB) return;
	collegeDB = collegeDBConfig(bindings);
	await initializeAsync(collegeDB);
}
