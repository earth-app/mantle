import * as ocean from '@earth-app/ocean';

import { com } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import { ActivityObject, toActivity } from '../../types/activities';

// Helpers

export function createEvent(
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
		throw new HTTPException(401, { message: `Failed to create activity: ${error}` });
	}
}

// Database

export type DBActivity = {
	id: string;
	binary: Uint8Array;
	created_at?: Date;
	updated_at?: Date;
};

function toActivityObject(activity: DBActivity): ActivityObject {
	const activityClass = ocean.fromBinary(new Int8Array(activity.binary)) as com.earthapp.activity.Activity;
	return {
		public: toActivity(activityClass),
		database: activity,
		activity: activityClass
	};
}

async function checkTableExists(d1: D1Database) {
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

export async function saveActivity(activity: com.earthapp.activity.Activity, d1: D1Database): Promise<ActivityObject> {
	await checkTableExists(d1);

	const query = `INSERT INTO activities (id, binary) VALUES (?, ?)`;
	const result = await d1.prepare(query).bind(activity.id, new Uint8Array(activity.toBinary())).run();

	if (!result.success) throw new Error(`Failed to save activity with ID ${activity.id}: ${result.error}`);

	const newActivity = toActivityObject({
		id: activity.id,
		binary: new Uint8Array(activity.toBinary()),
		created_at: new Date(),
		updated_at: new Date()
	});
	return newActivity;
}

export async function updateActivity(obj: ActivityObject, d1: D1Database): Promise<ActivityObject> {
	await checkTableExists(d1);

	const query = `UPDATE activities SET binary = ?, updated_at = ? WHERE id = ? LIMIT 1`;
	const updatedAt = new Date(); // Prevent mismatched timestamps in case SQL takes time

	const result = await d1.prepare(query).bind(new Uint8Array(obj.activity.toBinary()), obj.activity.id).run();

	if (!result.success) throw new Error(`Failed to update activity with ID ${obj.activity.id}: ${result.error}`);

	const updatedActivity = toActivityObject({
		id: obj.activity.id,
		binary: new Uint8Array(obj.activity.toBinary()),
		created_at: obj.database.created_at,
		updated_at: updatedAt
	});
	return updatedActivity;
}

export async function deleteEvent(id: string, d1: D1Database): Promise<boolean> {
	await checkTableExists(d1);

	const query = `DELETE FROM activities WHERE id = ? LIMIT 1`;
	const result = await d1.prepare(query).bind(id).run();

	return result.success;
}
