import { allAllShards, createSchemaAcrossShards, first, firstAllShards, KVShardMapper, run } from '@earth-app/collegedb';
import * as ocean from '@earth-app/ocean';
import { com, kotlin } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { Activity, ActivityObject, toActivity } from '../../types/activities';
import { DBError, ValidationError } from '../../types/errors';
import { collegeDB, init } from '../collegedb';
import * as cache from './cache';

// Helpers

export function createActivity(
	id: string,
	name: string,
	callback: (activity: com.earthapp.activity.Activity) => void
): com.earthapp.activity.Activity {
	try {
		const activity = new com.earthapp.activity.Activity(id, name);
		callback(activity);
		activity.validate();

		return activity;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to create activity: ${error}` });
	}
}

// Database

export type DBActivity = {
	id: string;
	binary: Uint8Array;
	created_at: Date;
	updated_at?: Date;
};

function toActivityObject(activity: DBActivity | null): ActivityObject | null {
	if (!activity) return null;

	try {
		const activityClass = ocean.fromBinary(new Int8Array(activity.binary)) as com.earthapp.activity.Activity;
		return {
			public: toActivity(activityClass),
			database: activity,
			activity: activityClass
		};
	} catch (error) {
		console.error(`Failed to convert DBActivity to ActivityObject: ${error}`);
		throw new DBError(`Failed to convert DBActivity to ActivityObject: ${error}`);
	}
}

export async function healthCheck(bindings: Bindings): Promise<boolean> {
	try {
		await init(bindings);
		const query = `CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY NOT NULL UNIQUE,
            binary BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_id ON activities(id);`;

		await createSchemaAcrossShards(collegeDB.shards, query);
	} catch (error) {
		console.error(`Activities Health check failed: ${error}`);
		return false;
	}

	return true;
}

async function findActivity(query: string, bindings: Bindings, ...params: any[]): Promise<DBActivity[]> {
	await init(bindings);

	const results = (await allAllShards<DBActivity>(query, params)).flatMap((row) => row.results);
	if (!results || results.length === 0) throw new DBError(`No activities found for query: ${query}`);

	return results;
}

export async function saveActivity(activity: com.earthapp.activity.Activity, bindings: Bindings): Promise<ActivityObject> {
	await init(bindings);

	const query = `INSERT INTO activities (id, binary) VALUES (?, ?)`;
	const result = await run(activity.id, query, [activity.id, new Uint8Array(activity.toBinary())]);

	if (!result.success) throw new DBError(`Failed to save activity with ID ${activity.id}: ${result.error}`);

	const newActivity = toActivityObject({
		id: activity.id,
		binary: new Uint8Array(activity.toBinary()),
		created_at: new Date(),
		updated_at: new Date()
	});
	if (!newActivity) {
		throw new DBError(`Failed to convert saved activity with ID ${activity.id} to ActivityObject`);
	}

	return newActivity;
}

export async function updateActivity(obj: ActivityObject, bindings: Bindings): Promise<ActivityObject> {
	await init(bindings);

	const query = `UPDATE activities SET binary = ?, updated_at = ? WHERE id = ? LIMIT 1`;
	const updatedAt = new Date(); // Prevent mismatched timestamps in case SQL takes time

	const id0 = obj.activity.id.trim().toLowerCase();
	const result = await run(id0, query, [new Uint8Array(obj.activity.toBinary()), updatedAt.toISOString(), obj.activity.id]);

	if (!result.success) throw new DBError(`Failed to update activity with ID ${obj.activity.id}: ${result.error}`);

	const updatedActivity = toActivityObject({
		id: obj.activity.id,
		binary: new Uint8Array(obj.activity.toBinary()),
		created_at: obj.database.created_at,
		updated_at: updatedAt
	});

	if (!updatedActivity) {
		throw new DBError(`Failed to convert updated activity with ID ${obj.activity.id} to ActivityObject`);
	}

	const cacheKey = `activity:${id0}`;
	cache.cache(cacheKey, updatedActivity.database, bindings.KV_CACHE);

	return updatedActivity;
}

export async function deleteActivity(id: string, bindings: Bindings): Promise<boolean> {
	await init(bindings);

	const id0 = id.trim().toLowerCase();

	const query = `DELETE FROM activities WHERE id = ? LIMIT 1`;
	const result = await run(id0, query, [id]);
	if (!result.success) return false;

	const cacheKey = `activity:${id0}`;
	await cache.clearCache(cacheKey, bindings.KV_CACHE);

	const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
	mapper.deleteShardMapping(id0);

	return true;
}

// Activity retrieval functions

export async function getActivitiesCount(bindings: Bindings, search: string = ''): Promise<number> {
	await init(bindings);

	const query = `SELECT COUNT(*) as count FROM activities${search ? ' WHERE id LIKE ?' : ''}`;
	const params = search ? [`%${search.trim().toLowerCase()}%`] : [];
	const result = await firstAllShards<{ count: number }>(query, params);

	return result.filter((row) => row != null).reduce((sum, row) => sum + row.count, 0);
}

export async function getActivities(
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = ''
): Promise<ActivityObject[]> {
	const cacheKey = `activities:${limit}:${page}:${search.trim().toLowerCase()}`;

	return (
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			await init(bindings);

			const offset = page * limit;
			const searchQuery = search ? ' WHERE id LIKE ?' : '';
			const query = `SELECT * FROM activities${searchQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
			const params = search ? [`%${search.trim().toLowerCase()}%`, limit, offset] : [limit, offset];

			const results = await allAllShards<DBActivity>(query, params);

			const allActivities: DBActivity[] = [];
			results.forEach((result) => {
				allActivities.push(...result.results);
			});

			allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

			const paginatedPrompts = allActivities.slice(offset, offset + limit);
			return await Promise.all(paginatedPrompts);
		})
	)
		.map((activity) => toActivityObject(activity))
		.filter((activity) => activity !== null);
}

export async function getRandomActivities(bindings: Bindings, limit: number = 25): Promise<ActivityObject[]> {
	const query = `SELECT * FROM activities ORDER BY RANDOM() LIMIT ?`;
	const results = await findActivity(query, bindings, limit);

	return results.map((activity) => toActivityObject(activity)).filter((activity) => activity !== null);
}

export async function doesActivityExist(id: string, bindings: Bindings): Promise<boolean> {
	if (await cache.checkCacheExists(`activity:${id.trim().toLowerCase()}`, bindings.KV_CACHE)) return true;

	await init(bindings);

	const query = `SELECT COUNT(*) as count FROM activities WHERE id = ? LIMIT 1`;
	const result = await firstAllShards<{ count: number }>(query, [id]);
	if (!result) return false;

	return result.filter((row) => row != null).reduce((sum, row) => sum + row.count, 0) > 0;
}

export async function getActivityById(id: string, bindings: Bindings): Promise<ActivityObject | null> {
	if (!id) throw new ValidationError('Activity ID is required');
	const cacheKey = `activity:${id.trim().toLowerCase()}`;

	return toActivityObject(
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			await init(bindings);

			const query = `SELECT * FROM activities WHERE id = ? LIMIT 1`;
			const result = await first<DBActivity>(id.trim().toLowerCase(), query, [id]);
			if (!result) return null;

			return result;
		})
	);
}

export async function getActivityByAlias(alias: string, bindings: Bindings): Promise<ActivityObject | null> {
	const alias0 = alias.trim().toLowerCase();
	const cacheKey = `activity:${alias0}`;

	return toActivityObject(
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			// Loop through activities until we find an alias match
			let activities = await getActivities(bindings, 100);
			let page = 0;
			while (activities.length > 0) {
				for (const activity of activities) {
					if (activity.activity.doesMatch(alias0)) {
						return activity.database;
					}
				}

				page++;
				activities = await getActivities(bindings, 100, page);
			}

			return null; // No activity found with the given ID or alias
		})
	);
}

// Activity update function

export async function patchActivity(
	activityObject: ActivityObject,
	data: Partial<Activity>,
	bindings: Bindings
): Promise<ActivityObject | null> {
	const activity = activityObject.activity;
	if (!activity) {
		throw new ValidationError(`Activity with ID ${activityObject.database.id} not found`);
	}

	let newActivity = activity.deepCopy() as com.earthapp.activity.Activity;
	try {
		let types: kotlin.collections.KtList<com.earthapp.activity.ActivityType> | undefined = undefined;
		if (data.types) {
			types = kotlin.collections.KtList.fromJsArray(data.types.map((type) => com.earthapp.activity.ActivityType.valueOf(type)));
		} else {
			types = activityObject.activity.types;
		}

		let aliases: kotlin.collections.KtList<string> | undefined = undefined;
		if (data.aliases) {
			aliases = kotlin.collections.KtList.fromJsArray(data.aliases.map((alias) => alias.trim().toLowerCase()));
		} else {
			aliases = activityObject.activity.aliases;
		}

		let fields: kotlin.collections.KtMap<string, string> | undefined = undefined;
		if (data.fields) {
			fields = kotlin.collections.KtMap.fromJsMap(new Map(Object.entries(data.fields)));
		} else {
			fields = activityObject.activity.getAllFields();
		}

		newActivity = newActivity.patch(data.name ?? newActivity.name, data.description ?? newActivity.description, types, aliases, fields);
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to patch activity: ${error}` });
	}

	activityObject.activity = newActivity;
	return await updateActivity(activityObject, bindings);
}
