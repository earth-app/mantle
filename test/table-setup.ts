import { checkTableExists as checkTokensTableExists } from '../src/util/authentication';
import { checkTableExists as checkActivitiesTableExists } from '../src/util/routes/activities';
import { checkTableExists as checkEventsTableExists } from '../src/util/routes/events';
import { checkTableExists as checkUsersTableExists } from '../src/util/routes/users';

export async function setupActivitiesTable(db: any) {
	await checkActivitiesTableExists(db);
}

export async function setupEventsTable(db: any) {
	await checkEventsTableExists(db);
}

export async function setupUsersTable(db: any) {
	await checkUsersTableExists(db);
}

export async function setupTokensTable(db: any) {
	await checkTokensTableExists(db);
}

export async function setupAllTables(db: any) {
	await setupUsersTable(db);
	await setupActivitiesTable(db);
	await setupEventsTable(db);
	await setupTokensTable(db);
}
