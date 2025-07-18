import { Context } from 'hono';

export function toBase64(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64: string): Uint8Array {
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function toArrayBuffer(view: Uint8Array): ArrayBuffer {
	return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a[i] ^ b[i];
	}

	return result === 0;
}

export function getCredentials(basic: string) {
	if (!basic.startsWith('Basic ')) throw new Error('Invalid Basic Auth format');

	const base64Credentials = basic.slice(6);
	const credentials = atob(base64Credentials);
	const colonIndex = credentials.indexOf(':');
	if (colonIndex === -1) throw new Error('Invalid credentials format');

	return [credentials.slice(0, colonIndex), credentials.slice(colonIndex + 1)];
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

export function paginatedParameters(c: Context): {
	code?: 400;
	message?: string;
	page: number;
	limit: number;
	search: string;
} {
	const page = c.req.query('page') ? parseInt(c.req.query('page')!) : 1;
	const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 25;
	const search = c.req.query('search') || '';

	if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
		return {
			code: 400,
			message: 'Invalid pagination parameters',
			page: 1,
			limit: 25,
			search: ''
		};
	}

	if (limit > 100) {
		return {
			code: 400,
			message: 'Limit cannot exceed 100',
			page: 1,
			limit: 25,
			search: ''
		};
	}

	if (search.length > 40) {
		return {
			code: 400,
			message: 'Search query cannot exceed 40 characters',
			page: 1,
			limit: 25,
			search: ''
		};
	}

	return { page, limit, search };
}
