import { Event, EventObject, toEvent } from '../../types/events';
import { haversineDistance } from '../util';

import { allAllShards, createSchemaAcrossShards, first, firstAllShards, KVShardMapper, run } from '@earth-app/collegedb';
import * as ocean from '@earth-app/ocean';
import { com } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { DBError, ValidationError } from '../../types/errors';
import { collegeDB, init } from '../collegedb';
import * as cache from './cache';

// Helpers

export function createEvent(hostId: string, callback: (event: com.earthapp.event.Event) => void): com.earthapp.event.Event {
	try {
		const id = com.earthapp.event.Event.newId();
		const event = new com.earthapp.event.Event(id, hostId);
		callback(event);
		event.validate();

		return event;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to create event: ${error}` });
	}
}

// Database

export type DBEvent = {
	id: string;
	binary: Uint8Array;
	hostId: string;
	name: string;
	attendees: string[];
	latitude?: number;
	longitude?: number;
	date: Date;
	created_at?: Date;
	updated_at?: Date;
};

function toEventObject(event: DBEvent | null): EventObject | null {
	if (!event) return null;

	try {
		const eventClass = ocean.fromBinary(new Int8Array(event.binary)) as com.earthapp.event.Event;
		return {
			public: toEvent(eventClass, event.created_at, event.updated_at),
			database: event,
			event: eventClass
		};
	} catch (error) {
		console.error(`Failed to convert DBEvent to EventObject: ${error}`);
		throw new DBError(`Failed to convert DBEvent to EventObject: ${error}`);
	}
}

export async function healthCheck(bindings: Bindings) {
	try {
		await init(bindings);
		const query = `CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY NOT NULL UNIQUE,
            binary BLOB NOT NULL,
            hostId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            attendees TEXT NOT NULL,
            latitude DOUBLE,
            longitude DOUBLE,
            date DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_id ON events(id);
        CREATE INDEX IF NOT EXISTS idx_events_hostId ON events(hostId);
        CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
        CREATE INDEX IF NOT EXISTS idx_events_attendees ON events(attendees);
        CREATE INDEX IF NOT EXISTS idx_events_latitude ON events(latitude);
        CREATE INDEX IF NOT EXISTS idx_events_longitude ON events(longitude);
        CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);`;

		await createSchemaAcrossShards(collegeDB.shards, query);
	} catch (error) {
		console.error(`Events Health check failed: ${error}`);
		return false;
	}

	return true;
}

async function findEvent(query: string, bindings: Bindings, ...params: any[]): Promise<DBEvent[]> {
	await init(bindings);

	const results = (await allAllShards(query, params)).flatMap((row) => row.results);

	if (!results || results.length === 0) throw new Error(`No events found for query: ${query} with params: '${params.join(', ')}'`);

	return results.map((result: Record<string, unknown>) => {
		return {
			id: result.id as string,
			binary: result.binary as Uint8Array,
			hostId: result.hostId as string,
			name: result.name as string,
			attendees: result.attendees ? JSON.parse(result.attendees as string) : [],
			latitude: result.latitude as number | undefined,
			longitude: result.longitude as number | undefined,
			date: new Date(result.date as number)
		};
	});
}

export async function saveEvent(event: com.earthapp.event.Event, bindings: Bindings): Promise<EventObject> {
	await init(bindings);

	const query = `INSERT INTO events (id, binary, hostId, name, attendees, latitude, longitude, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
	const result = await run(event.id, query, [
		event.id,
		new Uint8Array(event.toBinary()),
		event.hostId,
		event.name,
		JSON.stringify(event.attendees),
		event.location?.latitude ?? null,
		event.location?.longitude ?? null,
		event.date
	]);
	if (!result.success) throw new DBError(`Failed to save event with ID ${event.id}: ${result.error}`);

	const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
	const shard = await mapper.getShardMapping(event.id);
	if (!shard) throw new DBError(`No shard found for event ID ${event.id}`);
	await mapper.setShardMapping(event.id, shard.shard, [`event-host:${event.hostId}`]);

	const newEvent = toEventObject({
		id: event.id,
		binary: new Uint8Array(event.toBinary()),
		hostId: event.hostId,
		name: event.name,
		attendees: event.attendees.asJsArrayView() as string[],
		latitude: event.location?.latitude,
		longitude: event.location?.longitude,
		date: new Date(event.date),
		created_at: new Date(),
		updated_at: new Date()
	});
	if (!newEvent) {
		throw new DBError(`Failed to convert event to EventObject after saving: ${event.id}`);
	}

	return newEvent;
}

export async function updateEvent(obj: EventObject, bindings: Bindings): Promise<EventObject> {
	await init(bindings);

	const query = `UPDATE events SET
        binary = ?,
        name = ?,
		attendees = ?,
        latitude = ?,
        longitude = ?,
        date = ?,
        updated_at = ?,
        WHERE id = ?`;

	const updatedAt = new Date(); // Prevent mismatched timestamps in case SQL takes time

	const result = await run(obj.database.id, query, [
		new Uint8Array(obj.event.toBinary()),
		obj.event.name,
		JSON.stringify(obj.event.attendees),
		obj.event.location?.latitude ?? null,
		obj.event.location?.longitude ?? null,
		obj.event.date,
		updatedAt,
		obj.event.id
	]);
	if (!result.success) throw new Error(`Failed to update event with ID ${obj.event.id}: ${result.error}`);

	const updatedEvent = toEventObject({
		id: obj.database.id,
		binary: new Uint8Array(obj.event.toBinary()),
		hostId: obj.database.hostId,
		name: obj.event.name,
		attendees: obj.event.attendees.asJsArrayView() as string[],
		latitude: obj.event.location?.latitude,
		longitude: obj.event.location?.longitude,
		date: new Date(obj.event.date),
		created_at: obj.database.created_at,
		updated_at: updatedAt
	});
	if (!updatedEvent) {
		throw new DBError(`Failed to convert updated event to EventObject: ${obj.event.id}`);
	}

	await cache.clearCache(`event:${obj.event.id}`, bindings.KV_CACHE);

	return updatedEvent;
}

export async function deleteEvent(id: string, bindings: Bindings): Promise<boolean> {
	await init(bindings);

	const result = await run(id, 'DELETE FROM events WHERE id = ?', [id]);
	if (!result.success) throw new DBError(`Failed to delete event with ID ${id}: ${result.error}`);

	const cacheKey = `event:${id}`;
	await cache.clearCache(cacheKey, bindings.KV_CACHE);

	const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
	await mapper.deleteShardMapping(id);

	return result.success;
}

// Event retrieval functions

export async function getEvents(bindings: Bindings, limit: number = 25, page: number = 0, search: string = ''): Promise<EventObject[]> {
	const cacheKey = `events:${limit}:${page}:${search}`;

	return (
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			await init(bindings);

			const offset = page * limit;
			const searchQuery = search ? ' WHERE name LIKE ?' : '';
			const query = `SELECT * FROM events${searchQuery} ORDER BY date DESC LIMIT ? OFFSET ?`;
			const params = search ? [`%${search.trim().toLowerCase()}%`, limit, offset] : [limit, offset];

			const results = await allAllShards<DBEvent>(query, params);

			const allEvents: DBEvent[] = [];
			results.forEach((result) => {
				allEvents.push(...result.results);
			});

			allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

			const paginatedEvents = allEvents.slice(offset, offset + limit);
			return await Promise.all(paginatedEvents);
		})
	)
		.map((event) => toEventObject(event))
		.filter((event) => event !== null);
}

export async function getEventsCount(bindings: Bindings, search: string = ''): Promise<number> {
	await init(bindings);
	const query = `SELECT COUNT(*) as count FROM events${search ? ' WHERE name LIKE ?' : ''}`;
	const params = search ? [`%${search.trim().toLowerCase()}%`] : [];
	const result = await firstAllShards<{ count: number }>(query, params);

	if (!result || result.length === 0) return 0;

	return result.filter((r) => r != null).reduce((total, r) => total + (r.count || 0), 0);
}

export async function getEventsInside(
	bindings: Bindings,
	latitude: number,
	longitude: number,
	radius: number,
	limit: number = 25,
	page: number = 0
): Promise<EventObject[]> {
	const cacheKey = `events:inside:${latitude}:${longitude}:${radius}:${limit}:${page}`;

	return (
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			const latRange = radius / 111.32; // roughly 1 degree latitude = 111.32 km
			const lonRange = radius / (111.32 * Math.cos((latitude * Math.PI) / 180));

			const boundingBoxQuery = `SELECT * FROM events WHERE
        latitude IS NOT NULL AND longitude IS NOT NULL AND
        latitude BETWEEN ? AND ? AND
        longitude BETWEEN ? AND ? LIMIT ? OFFSET ?`;

			const candidateResults = await findEvent(
				boundingBoxQuery,
				bindings,
				latitude - latRange,
				latitude + latRange,
				longitude - lonRange,
				longitude + lonRange,
				limit,
				page * limit
			);

			if (candidateResults.length === 0) return [];

			const filteredResults = candidateResults.filter((event) => {
				const { latitude: eventLat, longitude: eventLon } = event;
				if (eventLat == null || eventLon == null) return false;

				const distance = haversineDistance(latitude, longitude, eventLat, eventLon);
				return distance <= radius;
			});

			return filteredResults;
		})
	)
		.map((event) => toEventObject(event))
		.filter((event) => event !== null);
}

export async function doesEventExist(id: string, bindings: Bindings): Promise<boolean> {
	if (await cache.checkCacheExists(`event:${id}`, bindings.KV_CACHE)) return true;

	await init(bindings);

	const result = await first<{ count: number }>(id, 'SELECT COUNT(*) as count FROM events WHERE id = ?', [id]);
	return result ? result.count > 0 : false;
}

export async function getEventById(id: string, bindings: Bindings): Promise<EventObject | null> {
	const cacheKey = `event:${id}`;

	return toEventObject(
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			await init(bindings);
			const event = await first<DBEvent>(id, 'SELECT * FROM events WHERE id = ? LIMIT 1', [id]);
			if (!event) return null;

			return event;
		})
	);
}

export async function getEventsByHostId(hostId: string, bindings: Bindings, limit: number = 25, page: number = 0): Promise<EventObject[]> {
	const cacheKey = `events:host:${hostId}:${limit}:${page}`;
	return (
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			const query = 'SELECT * FROM events WHERE hostId = ? LIMIT ? OFFSET ?';
			return await findEvent(query, bindings, hostId, limit, page * limit);
		})
	)
		.map((event) => toEventObject(event))
		.filter((event) => event !== null);
}

export async function getEventsByAttendees(
	attendees: string[],
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = ''
): Promise<EventObject[]> {
	if (attendees.length > 10) {
		throw new HTTPException(400, { message: 'Too many attendees specified. Maximum is 10.' });
	}

	const cacheKey = `events:attendees:${attendees.join(',')}:${limit}:${page}:${search}`;
	return (
		await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
			const query = `SELECT * FROM events WHERE attendees IS NOT NULL ${
				search ? `WHERE name LIKE ? ` : ''
			}AND JSON_EXTRACT(attendees, ?) IS NOT NULL LIMIT ? OFFSET ?`;
			let results: DBEvent[];
			if (search) results = await findEvent(query, bindings, `%${search}%`, `$.${attendees.join(',$.')}`, limit, page * limit);
			else results = await findEvent(query, bindings, `$.${attendees.join(',$.')}`, limit, page * limit);
			if (results.length === 0) return [];

			// Verify attendees against the event's attendees
			// This is necessary because JSON_EXTRACT can return events with empty or mismatched attendees
			return results.filter((event) => {
				const eventAttendees = event.attendees || [];
				return attendees.some((attendee) => eventAttendees.includes(attendee) || event.hostId === attendee);
			});
		})
	)
		.map((event) => toEventObject(event))
		.filter((event) => event !== null);
}

// Event update functions

export async function patchEvent(eventObject: EventObject, data: Partial<Event>, bindings: Bindings) {
	const event = eventObject.event;
	if (!event) {
		throw new ValidationError(`Event with ID ${eventObject.public.id} not found`);
	}

	let newEvent = event.deepCopy() as com.earthapp.event.Event;

	try {
		let location: com.earthapp.event.Location | undefined;
		if (data.location) location = new com.earthapp.event.Location(data.location.latitude, data.location.longitude);

		newEvent = newEvent.patch(
			data.name ?? newEvent.name,
			data.description ?? newEvent.description,
			data.date?.getTime() ?? newEvent.date,
			data.end_date?.getTime() ?? newEvent.endDate,
			location,
			com.earthapp.event.EventType.valueOf(data.type ?? newEvent.type.name),
			com.earthapp.Visibility.valueOf(data.visibility ?? newEvent.visibility.name)
		);
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to patch event: ${error instanceof Error ? error.message : 'Unknown error'}` });
	}

	eventObject.event = newEvent;
	return await updateEvent(eventObject, bindings);
}
