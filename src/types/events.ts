import { com } from '@earth-app/ocean';
import { DBEvent } from '../util/routes/events';

/**
 * EventObject type representing an event in the Earth App system.
 * Contains event details and associated event class metadata.
 */
export type EventObject = {
	/**
	 * The event object containing event details.
	 */
	public: Event;
	/**
	 * The database event object.
	 */
	database: DBEvent;
	/**
	 * The event class metadata associated with the event.
	 */
	event: com.earthapp.event.Event;
};

/**
 * Event type representing an event in the Earth App system.
 * Contains event details such as ID, host ID, name, description, type, activities, location, and date.
 */
export type Event = {
	id: string;
	hostId: string;
	name: string;
	description: string;
	type: typeof com.earthapp.event.EventType.prototype.name;
	activities: (typeof com.earthapp.activity.ActivityType.prototype.name)[];
	location?: {
		latitude: number;
		longitude: number;
	};
	date: Date;
	end_date: Date;
	visibility?: typeof com.earthapp.Visibility.prototype.name;
	created_at?: Date;
	updated_at?: Date;
};

/**
 * Converts an com.earthapp.event.Event object to an Event object.
 * @param data The event data to convert.
 * @returns An Event object.
 */
export function toEvent(data: com.earthapp.event.Event, created_at: Date = new Date(), updated_at: Date = new Date()): Event {
	return {
		id: data.id,
		hostId: data.hostId,
		name: data.name,
		description: data.description,
		type: data.type.name,
		activities: data.activities.asJsArrayView() as (typeof com.earthapp.activity.ActivityType.prototype.name)[],
		location: data.location
			? {
					latitude: data.location.latitude,
					longitude: data.location.longitude
				}
			: undefined,
		date: new Date(data.date),
		end_date: new Date(data.endDate),
		created_at: created_at,
		updated_at: updated_at
	};
}
