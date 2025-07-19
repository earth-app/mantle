// Test-specific table setup functions that work with mock D1
// The mock D1 database can be populated with JSON data directly
// and doesn't require table existence checks

export async function setupActivitiesTable(db: any) {
	// Mock D1 supports simple table creation without complex constraints
	try {
		await db
			.prepare(
				`CREATE TABLE activities (id TEXT, name TEXT, description TEXT, category TEXT, location TEXT, image TEXT, privacy TEXT, created_at TEXT, updated_at TEXT)`
			)
			.run();
	} catch (error) {
		// Table might already exist, ignore errors
	}
}

export async function setupEventsTable(db: any) {
	try {
		await db
			.prepare(
				`CREATE TABLE events (id TEXT, name TEXT, description TEXT, location TEXT, image TEXT, privacy TEXT, start_time TEXT, end_time TEXT, created_at TEXT, updated_at TEXT)`
			)
			.run();
	} catch (error) {
		// Table might already exist, ignore errors
	}
}

export async function setupUsersTable(db: any) {
	try {
		await db
			.prepare(
				`CREATE TABLE users (id TEXT, username TEXT, password TEXT, salt TEXT, binary TEXT, encryption_key TEXT, encryption_iv TEXT, last_login TEXT, created_at TEXT, updated_at TEXT)`
			)
			.run();
	} catch (error) {
		// Table might already exist, ignore errors
	}
}

export async function setupTokensTable(db: any) {
	try {
		await db.prepare(`CREATE TABLE tokens (id TEXT, user_id TEXT, token TEXT, expires_at TEXT, created_at TEXT)`).run();
	} catch (error) {
		// Table might already exist, ignore errors
	}
}

export async function setupAllTables(db: any) {
	await setupUsersTable(db);
	await setupActivitiesTable(db);
	await setupEventsTable(db);
	await setupTokensTable(db);
}
