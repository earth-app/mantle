import { com } from '@earth-app/ocean';
import { DBActivity } from '../util/routes/activities';

/**
 * ActivityObject type representing an activity in the Earth App system.
 * Contains activity details and associated activity class metadata.
 */
export type ActivityObject = {
	/**
	 * The activity object containing activity details.
	 */
	public: Activity;
	/**
	 * The database activity object.
	 */
	database: DBActivity;
	/**
	 * The activity object containing activity details.
	 */
	activity: com.earthapp.activity.Activity;
};

/**
 * Activity type representing an activity in the Earth App system.
 * Contains activity details such as ID, name, description, types, and timestamps.
 */
export type Activity = {
	id: string;
	name: string;
	aliases?: string[];
	description?: string;
	types: (typeof com.earthapp.activity.ActivityType.prototype.name)[];
	created_at?: Date;
	updated_at?: Date;
};

/**
 * Converts an com.earthapp.activity.Activity object to an Activity object.
 * @param data The activity data to convert.
 * @param created_at The creation date of the activity.
 * @param updated_at The last updated date of the activity.
 * @returns An Activity object.
 */
export function toActivity(data: com.earthapp.activity.Activity, created_at: Date = new Date(), updated_at: Date = new Date()): Activity {
	return {
		id: data.id,
		name: data.name,
		aliases: data.aliases.asJsReadonlyArrayView().map((alias) => alias.toString()),
		description: data.description ?? undefined,
		types: data.types.asJsArrayView().map((type) => type.name),
		created_at: created_at,
		updated_at: updated_at
	};
}
