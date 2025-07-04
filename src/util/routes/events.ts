import { D1Database } from '@cloudflare/workers-types'
import * as ocean from '@earth-app/ocean'
import { EventObject, toEvent } from '../../types/users'
import { haversineDistance } from '../util'

// Database
export type DBEvent = {
    id: string
    binary: Uint32Array,
    hostId: string
    name: string
    type: typeof ocean.com.earthapp.event.EventType.prototype.name
    attendees: string[],
    activities: string[]
    latitude?: number
    longitude?: number
    date: Date
    endDate: Date
}

async function toEventObject(event: DBEvent): Promise<EventObject> {
    const eventClass = ocean.fromBinary(new Int8Array(event.binary)) as ocean.com.earthapp.event.Event
    return {
        public: toEvent(eventClass),
        database: event,
        event: eventClass
    }
}

async function checkTableExists(d1: D1Database) {
    const query = `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL UNIQUE,
        binary BLOB NOT NULL,
        hostId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        attendees TEXT,
        activities TEXT,
        latitude DOUBLE,
        longitude DOUBLE,
        date DATETIME NOT NULL,
        endDate DATETIME NOT NULL
    )`
    await d1.prepare(query).run()
    
    // Indexes for performance
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_hostId ON events(hostId)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_name ON events(name)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_attendees ON events(attendees)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_activities ON events(activities)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_latitude ON events(latitude)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_longitude ON events(longitude)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)`).run()
    await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_events_endDate ON events(endDate)`).run()
}

async function findEvent(query: string, d1: D1Database, ...params: any[]): Promise<EventObject[]> {
    await checkTableExists(d1)

    const row = await d1.prepare(query)
        .bind(params)
        .all()
    
    if (!row) throw new Error(`No events found for query: ${query} with params: '${params.join(', ')}'`)
    
    return Promise.all(row.results.map(result => {
        const event: DBEvent = {
            id: result.id as string,
            binary: new Uint32Array(result.binary as Uint8Array),
            hostId: result.hostId as string,
            name: result.name as string,
            type: result.type as typeof ocean.com.earthapp.event.EventType.prototype.name,
            attendees: result.attendees ? JSON.parse(result.attendees as string) : [],
            activities: result.activities ? JSON.parse(result.activities as string) : [],
            latitude: result.latitude as number | undefined,
            longitude: result.longitude as number | undefined,
            date: new Date(result.date as number),
            endDate: new Date(result.endDate as number)
        }

        return toEventObject(event)
    }))
}

export async function saveEvent(event: ocean.com.earthapp.event.Event, d1: D1Database): Promise<EventObject> {
    await checkTableExists(d1)

    const query = `INSERT INTO events (id, binary, hostId, name, type, activities, latitude, longitude, date, endDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    const result = await d1.prepare(query)
        .bind(
            event.id,
            new Uint8Array(event.toBinary()),
            event.hostId,
            event.name,
            event.description,
            event.type.name,
            JSON.stringify(event.activities),
            JSON.stringify(event.activities),
            event.location?.latitude ?? null,
            event.location?.longitude ?? null,
            event.date,
            event.endDate
        )
        .run()
    
    if (!result.success)
        throw new Error(`Failed to save event with ID ${event.id}: ${result.error}`)

    const newEvent = await getEventById(event.id, d1)
    if (!newEvent) throw new Error(`Failed to save event with ID ${event.id}`)

    return newEvent
}

export async function updateEvent(event: ocean.com.earthapp.event.Event, d1: D1Database): Promise<EventObject> {
    const query = `UPDATE events SET
        binary = ?,
        hostId = ?,
        name = ?,
        type = ?,
        attendees = ?,
        activities = ?,
        latitude = ?,
        longitude = ?,
        date = ?,
        endDate = ?
        WHERE id = ?`
    
    await d1.prepare(query)
        .bind(
            new Uint8Array(event.toBinary()),
            event.hostId,
            event.name,
            event.description,
            event.type.name,
            JSON.stringify(event.activities),
            JSON.stringify(event.activities),
            event.location?.latitude ?? null,
            event.location?.longitude ?? null,
            event.date,
            event.endDate,
            event.id
        )
        .run()
    
    const updatedEvent = await getEventById(event.id, d1)
    if (!updatedEvent) throw new Error(`Failed to update event with ID ${event.id}`)

    return updatedEvent
}

export async function deleteEvent(id: string, d1: D1Database): Promise<boolean> {
    await checkTableExists(d1)

    const result = await d1.prepare('DELETE FROM events WHERE id = ?')
        .bind(id)
        .run()

    return result.success
}

// Event retrieval functions

export async function getEvents(d1: D1Database, limit: number = 25, page: number = 0, search: string = ''): Promise<EventObject[]> {
    await checkTableExists(d1)

    const query = `SELECT * FROM events${search ? `WHERE name LIKE ?` : ''} ORDER BY date DESC LIMIT ? OFFSET ?`
    let results: EventObject[];
    
    if (search)
        results = await findEvent(query, d1, limit, page * limit, `%${search}%`)
    else
        results = await findEvent(query, d1, limit, page * limit)

    return results
}

export async function getEventsInside(d1: D1Database, latitude: number, longitude: number, radius: number, limit: number = 25, page: number = 0): Promise<EventObject[]> {
    await checkTableExists(d1)

    const latRange = radius / 111.32 // roughly 1 degree latitude = 111.32 km
    const lonRange = radius / (111.32 * Math.cos(latitude * Math.PI / 180))
    
    const boundingBoxQuery = `SELECT * FROM events WHERE 
        latitude IS NOT NULL AND longitude IS NOT NULL AND
        latitude BETWEEN ? AND ? AND
        longitude BETWEEN ? AND ? LIMIT ? OFFSET ?`
    
    const candidateResults = await findEvent(boundingBoxQuery, d1, 
        latitude - latRange, latitude + latRange,
        longitude - lonRange, longitude + lonRange,
        limit, page * limit
    )
    
    if (candidateResults.length === 0) return []

    const filteredResults = candidateResults.filter(event => {
        const { latitude: eventLat, longitude: eventLon } = event.database
        if (eventLat == null || eventLon == null) return false
        
        const distance = haversineDistance(latitude, longitude, eventLat, eventLon)
        return distance <= radius
    })

    return filteredResults
}

export async function doesEventExist(id: string, d1: D1Database): Promise<boolean> {
    await checkTableExists(d1)

    const result = await d1.prepare('SELECT COUNT(*) as count FROM events WHERE id = ?')
        .bind(id)
        .first<{ count: number }>()
    return result ? result.count > 0 : false
}

export async function getEventById(id: string, d1: D1Database): Promise<EventObject | null> {
    await checkTableExists(d1)

    const results = await findEvent('SELECT * FROM events WHERE id = ? LIMIT 1', d1, id)
    if (results.length === 0) return null

    return results[0]
}

export async function getEventsByHostId(hostId: string, d1: D1Database, limit: number = 25, page: number = 0): Promise<EventObject[]> {
    await checkTableExists(d1)

    const query = 'SELECT * FROM events WHERE hostId = ? LIMIT ? OFFSET ?'
    return await findEvent(query, d1, hostId, limit, page * limit)
}

export async function getEventsByAttendees(attendees: string[], d1: D1Database, limit: number = 25, page: number = 0): Promise<EventObject[]> {
    await checkTableExists(d1)

    const query = 'SELECT * FROM events WHERE attendees IS NOT NULL AND JSON_EXTRACT(attendees, ?) IS NOT NULL LIMIT ? OFFSET ?'
    const results = await findEvent(query, d1, `$.${attendees.join(',$.')}`, limit, page * limit)
    if (results.length === 0) return []

    // Verify attendees against the event's attendees
    // This is necessary because JSON_EXTRACT can return events with empty or mismatched attendees
    return results.filter(event => {
        const eventAttendees = event.database.attendees || []
        return attendees.some(attendee => eventAttendees.includes(attendee))
    })
}

// Event update functions

export async function addAttendeeToEvent(eventId: string, userId: string, d1: D1Database): Promise<boolean> {
    await checkTableExists(d1)

    const event = await getEventById(eventId, d1)
    if (!event) throw new Error(`Event with ID ${eventId} not found`)

    if (event.database.attendees.includes(userId)) {
        console.warn(`User ${userId} is already an attendee of event ${eventId}`)
        return false
    }

    event.database.attendees.push(userId)
    
    const query = `UPDATE events SET attendees = ? WHERE id = ?`
    const result = await d1.prepare(query)
        .bind(JSON.stringify(event.database.attendees), eventId)
        .run()
    
    if (!result.success) throw new Error(`Failed to add attendee ${userId} to event ${eventId}: ${result.error}`)

    return true
}

export async function removeAttendeeFromEvent(eventId: string, userId: string, d1: D1Database): Promise<boolean> {
    await checkTableExists(d1)

    const event = await getEventById(eventId, d1)
    if (!event) throw new Error(`Event with ID ${eventId} not found`)

    const index = event.database.attendees.indexOf(userId)
    if (index === -1) {
        console.warn(`User ${userId} is not an attendee of event ${eventId}`)
        return false
    }

    event.database.attendees.splice(index, 1)
    
    const query = `UPDATE events SET attendees = ? WHERE id = ?`
    const result = await d1.prepare(query)
        .bind(JSON.stringify(event.database.attendees), eventId)
        .run()
    
    if (!result.success) throw new Error(`Failed to remove attendee ${userId} from event ${eventId}: ${result.error}`)

    return true
}

export async function addActivityToEvent(eventId: string, activity: ocean.com.earthapp.activity.ActivityType, d1: D1Database): Promise<boolean> {
    await checkTableExists(d1)

    const event = await getEventById(eventId, d1)
    if (!event) throw new Error(`Event with ID ${eventId} not found`)

    if (event.database.activities.includes(activity.name)) {
        console.warn(`Activity ${activity.name} is already associated with event ${eventId}`)
        return false
    }

    event.database.activities.push(activity.name)
    
    const query = `UPDATE events SET activities = ? WHERE id = ?`
    const result = await d1.prepare(query)
        .bind(JSON.stringify(event.database.activities), eventId)
        .run()
    
    if (!result.success) throw new Error(`Failed to add activity ${activity.name} to event ${eventId}: ${result.error}`)

    return true
}

export async function removeActivityFromEvent(eventId: string, activity: ocean.com.earthapp.activity.ActivityType, d1: D1Database): Promise<boolean> {
    await checkTableExists(d1)

    const event = await getEventById(eventId, d1)
    if (!event) throw new Error(`Event with ID ${eventId} not found`)

    const index = event.database.activities.indexOf(activity.name)
    if (index === -1) {
        console.warn(`Activity ${activity.name} is not associated with event ${eventId}`)
        return false
    }

    event.database.activities.splice(index, 1)
    
    const query = `UPDATE events SET activities = ? WHERE id = ?`
    const result = await d1.prepare(query)
        .bind(JSON.stringify(event.database.activities), eventId)
        .run()
    
    if (!result.success) throw new Error(`Failed to remove activity ${activity.name} from event ${eventId}: ${result.error}`)

    return true
}