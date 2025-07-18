export interface MockBindings {
	DB: {
		exec: (sql: string) => Promise<void>;
		prepare: (sql: string) => {
			bind: (...params: any[]) => {
				run: () => Promise<{ success: boolean }>;
				first: () => Promise<any>;
				all: () => Promise<{ results: any[] }>;
			};
		};
	};
	KV: {
		get: (key: string) => Promise<any>;
		put: (key: string, value: any) => Promise<void>;
		delete: (key: string) => Promise<void>;
		list: (options?: any) => Promise<any>;
	};
	ANONYMOUS_RATE_LIMIT: {
		limit: (key: string) => Promise<{ success: boolean }>;
	};
	AUTH_RATE_LIMIT: {
		limit: (key: string) => Promise<{ success: boolean }>;
	};
	KEK: string;
	LOOKUP_HMAC_KEY: string;
	ADMIN_API_KEY: string;
}

export interface TestResponse {
	status: number;
	json: () => Promise<any>;
}

export interface TestUser {
	id: string;
	username: string;
	email: string;
	firstName?: string;
	lastName?: string;
	created_at: string;
}

export interface TestEvent {
	id: string;
	name: string;
	description: string;
	startTime: string;
	endTime?: string;
	location: string;
	latitude: number;
	longitude: number;
	capacity: number;
	visibility: string;
	createdBy: string;
	created_at: string;
}

export interface TestActivity {
	id: string;
	name: string;
	description: string;
	points: number;
	category: string;
	estimatedTime?: number;
	difficulty: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

declare global {
	var mockBindings: MockBindings;
}
