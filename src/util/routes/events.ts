import { D1Database } from '@cloudflare/workers-types';
import { Event, EventObject, toEvent } from '../../types/events';
import { haversineDistance } from '../util';

import * as ocean from '@earth-app/ocean';
import { com } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';

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

function toEventObject(event: DBEvent): EventObject {
	const eventClass = ocean.fromBinary(new Int8Array(event.binary)) as com.earthapp.event.Event;
	return {
		public: toEvent(eventClass, event.created_at, event.updated_at),
		database: event,
		event: eventClass
	};
}

async function checkTableExists(d1: D1Database) {
	const query = `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL UNIQUE,
        binary BLOB NOT NULL,
        hostId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
		attendees TEXT NOT NULL,
        latitude DOUBLE,
        longitude DOUBLE,
        date DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;
	const result = await d1.prepare(query).run();
	if (result.error) {
		throw new HTTPException(500, { message: `Failed to create events table: ${result.error}` });
	}

	// Indexes for performance
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_hostId ON events(hostId)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_name ON events(name)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_attendees ON events(attendees)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_latitude ON events(latitude)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_longitude ON events(longitude)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)`).run();
}

async function findEvent(query: string, d1: D1Database, ...params: any[]): Promise<EventObject[]> {
	await checkTableExists(d1);

	const row = await d1
		.prepare(query)
		.bind(...params)
		.all();

	if (!row || !row.success) throw new Error(`No events found for query: ${query} with params: '${params.join(', ')}'`);

	return row.results.map((result) => {
		const event: DBEvent = {
			id: result.id as string,
			binary: result.binary as Uint8Array,
			hostId: result.hostId as string,
			name: result.name as string,
			attendees: result.attendees ? JSON.parse(result.attendees as string) : [],
			latitude: result.latitude as number | undefined,
			longitude: result.longitude as number | undefined,
			date: new Date(result.date as number)
		};

		return toEventObject(event);
	});
}

export async function saveEvent(event: com.earthapp.event.Event, d1: D1Database): Promise<EventObject> {
	await checkTableExists(d1);

	const query = `INSERT INTO events (id, binary, hostId, name, attendees, latitude, longitude, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
	const result = await d1
		.prepare(query)
		.bind(
			event.id,
			new Uint8Array(event.toBinary()),
			event.hostId,
			event.name,
			JSON.stringify(event.attendees),
			event.location?.latitude ?? null,
			event.location?.longitude ?? null,
			event.date
		)
		.run();

	if (!result.success) throw new Error(`Failed to save event with ID ${event.id}: ${result.error}`);

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
	return newEvent;
}

export async function updateEvent(obj: EventObject, d1: D1Database): Promise<EventObject> {
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

	const result = await d1
		.prepare(query)
		.bind(
			new Uint8Array(obj.event.toBinary()),
			obj.event.name,
			JSON.stringify(obj.event.attendees),
			obj.event.location?.latitude ?? null,
			obj.event.location?.longitude ?? null,
			obj.event.date,
			updatedAt,
			obj.event.id
		)
		.run();

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
	return updatedEvent;
}

export async function deleteEvent(id: string, d1: D1Database): Promise<boolean> {
	await checkTableExists(d1);

	const result = await d1.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

	return result.success;
}

// Event retrieval functions

export async function getEvents(d1: D1Database, limit: number = 25, page: number = 0, search: string = ''): Promise<EventObject[]> {
	await checkTableExists(d1);

	const query = `SELECT * FROM events${search ? `WHERE name LIKE ?` : ''} ORDER BY date DESC LIMIT ? OFFSET ?`;
	let results: EventObject[];

	if (search) results = await findEvent(query, d1, `%${search}%`, limit, page * limit);
	else results = await findEvent(query, d1, limit, page * limit);

	return results;
}

export async function getEventsInside(
	d1: D1Database,
	latitude: number,
	longitude: number,
	radius: number,
	limit: number = 25,
	page: number = 0
): Promise<EventObject[]> {
	await checkTableExists(d1);

	const latRange = radius / 111.32; // roughly 1 degree latitude = 111.32 km
	const lonRange = radius / (111.32 * Math.cos((latitude * Math.PI) / 180));

	const boundingBoxQuery = `SELECT * FROM events WHERE
        latitude IS NOT NULL AND longitude IS NOT NULL AND
        latitude BETWEEN ? AND ? AND
        longitude BETWEEN ? AND ? LIMIT ? OFFSET ?`;

	const candidateResults = await findEvent(
		boundingBoxQuery,
		d1,
		latitude - latRange,
		latitude + latRange,
		longitude - lonRange,
		longitude + lonRange,
		limit,
		page * limit
	);

	if (candidateResults.length === 0) return [];

	const filteredResults = candidateResults.filter((event) => {
		const { latitude: eventLat, longitude: eventLon } = event.database;
		if (eventLat == null || eventLon == null) return false;

		const distance = haversineDistance(latitude, longitude, eventLat, eventLon);
		return distance <= radius;
	});

	return filteredResults;
}

export async function doesEventExist(id: string, d1: D1Database): Promise<boolean> {
	await checkTableExists(d1);

	const result = await d1.prepare('SELECT COUNT(*) as count FROM events WHERE id = ?').bind(id).first<{ count: number }>();
	return result ? result.count > 0 : false;
}

export async function getEventById(id: string, d1: D1Database): Promise<EventObject | null> {
	await checkTableExists(d1);

	const results = await findEvent('SELECT * FROM events WHERE id = ? LIMIT 1', d1, id);
	if (results.length === 0) return null;

	return results[0];
}

export async function getEventsByHostId(hostId: string, d1: D1Database, limit: number = 25, page: number = 0): Promise<EventObject[]> {
	await checkTableExists(d1);

	const query = 'SELECT * FROM events WHERE hostId = ? LIMIT ? OFFSET ?';
	return await findEvent(query, d1, hostId, limit, page * limit);
}

export async function getEventsByAttendees(
	attendees: string[],
	d1: D1Database,
	limit: number = 25,
	page: number = 0,
	search: string = ''
): Promise<EventObject[]> {
	await checkTableExists(d1);

	const query = `SELECT * FROM events WHERE attendees IS NOT NULL ${
		search ? `WHERE name LIKE ? ` : ''
	}AND JSON_EXTRACT(attendees, ?) IS NOT NULL LIMIT ? OFFSET ?`;
	let results: EventObject[];
	if (search) results = await findEvent(query, d1, `%${search}%`, `$.${attendees.join(',$.')}`, limit, page * limit);
	else results = await findEvent(query, d1, `$.${attendees.join(',$.')}`, limit, page * limit);
	if (results.length === 0) return [];

	// Verify attendees against the event's attendees
	// This is necessary because JSON_EXTRACT can return events with empty or mismatched attendees
	return results.filter((event) => {
		const eventAttendees = event.database.attendees || [];
		return attendees.some((attendee) => eventAttendees.includes(attendee) || event.database.hostId === attendee);
	});
}

// Event update functions

export async function patchEvent(event: com.earthapp.event.Event, data: Partial<Event>, d1: D1Database) {
	await checkTableExists(d1);

	const eventObject = await getEventById(event.id, d1);
	if (!eventObject) {
		console.error(`Event with ID ${event.id} not found`);
		throw new HTTPException(404, { message: `Event with ID ${event.id} not found` });
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
	return await updateEvent(eventObject, d1);
}
