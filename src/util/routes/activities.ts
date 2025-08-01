import * as ocean from '@earth-app/ocean';
import { com, kotlin } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { Activity, ActivityObject, toActivity } from '../../types/activities';
import { DBError, ValidationError } from '../../types/errors';
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
	created_at?: Date;
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

export async function checkTableExists(d1: D1Database) {
	const query = `CREATE TABLE IF NOT EXISTS activities (
		id TEXT PRIMARY KEY NOT NULL UNIQUE,
		binary BLOB NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`;

	const result = await d1.prepare(query).run();
	if (result.error) {
		throw new HTTPException(500, { message: `Failed to create activities table: ${result.error}` });
	}
}

async function findActivity(query: string, d1: D1Database, ...params: any[]): Promise<DBActivity[]> {
	await checkTableExists(d1);

	const row = await d1
		.prepare(query)
		.bind(...params)
		.all<DBActivity>();

	if (!row || !row.success) throw new DBError(`No activities found for query: ${query} with params: '${params.join(', ')}'`);

	return row.results;
}

export async function saveActivity(activity: com.earthapp.activity.Activity, d1: D1Database): Promise<ActivityObject> {
	await checkTableExists(d1);

	const query = `INSERT INTO activities (id, binary) VALUES (?, ?)`;
	const result = await d1.prepare(query).bind(activity.id, new Uint8Array(activity.toBinary())).run();

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
	const d1 = bindings.DB;
	await checkTableExists(d1);

	const query = `UPDATE activities SET binary = ?, updated_at = ? WHERE id = ? LIMIT 1`;
	const updatedAt = new Date(); // Prevent mismatched timestamps in case SQL takes time

	const result = await d1.prepare(query).bind(new Uint8Array(obj.activity.toBinary()), updatedAt.toISOString(), obj.activity.id).run();

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

	const cacheKey = `activity:${obj.activity.id.trim().toLowerCase()}`;
	cache.cache(cacheKey, updatedActivity.database, bindings.KV_CACHE);

	return updatedActivity;
}

export async function deleteActivity(id: string, bindings: Bindings): Promise<boolean> {
	const cacheKey = `activity:${id.trim().toLowerCase()}`;
	await cache.clearCache(cacheKey, bindings.KV_CACHE);

	const d1 = bindings.DB;
	await checkTableExists(d1);

	const query = `DELETE FROM activities WHERE id = ? LIMIT 1`;
	const result = await d1.prepare(query).bind(id).run();

	return result.success;
}

// Activity retrieval functions

export async function getActivities(
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = ''
): Promise<ActivityObject[]> {
	const cacheKey = `activities:${limit}:${page}:${search.trim().toLowerCase()}`;

	return (
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			const d1 = bindings.DB;
			await checkTableExists(d1);

			const query = `SELECT * FROM activities${search ? ` WHERE id LIKE ?` : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
			let results: DBActivity[];

			if (search) results = await findActivity(query, d1, `%${search}%`, limit, page * limit);
			else results = await findActivity(query, d1, limit, page * limit);

			return results;
		})
	)
		.map((activity) => toActivityObject(activity))
		.filter((activity) => activity !== null);
}

export async function doesActivityExist(id: string, bindings: Bindings): Promise<boolean> {
	if (await cache.checkCacheExists(`activity:${id.trim().toLowerCase()}`, bindings.KV_CACHE)) return true;

	const d1 = bindings.DB;
	await checkTableExists(d1);

	const query = `SELECT COUNT(*) as count FROM activities WHERE id = ?`;
	const result = await d1.prepare(query).bind(id).first<{ count: number }>();
	if (!result) return false;

	return result.count > 0;
}

export async function getActivityById(id: string, bindings: Bindings): Promise<ActivityObject | null> {
	if (!id) throw new ValidationError('Activity ID is required');
	const cacheKey = `activity:${id.trim().toLowerCase()}`;

	return toActivityObject(
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			const d1 = bindings.DB;
			await checkTableExists(d1);

			const query = `SELECT * FROM activities WHERE id = ? LIMIT 1`;
			const result = await d1.prepare(query).bind(id).first<DBActivity>();

			if (!result) return null;

			return {
				id: result.id,
				binary: new Uint8Array(result.binary),
				created_at: result.created_at ? new Date(result.created_at) : undefined,
				updated_at: result.updated_at ? new Date(result.updated_at) : undefined
			} satisfies DBActivity;
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
		throw new ValidationError(`Activity with ID ${activityObject.public.id} not found`);
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
