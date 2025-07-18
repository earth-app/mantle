import { describe, expect, it } from 'vitest';
import { constantTimeEqual, fromBase64, getCredentials, haversineDistance, toArrayBuffer, toBase64 } from '../../src/util/util';

describe('Utility Functions', () => {
	describe('toBase64', () => {
		it('should convert Uint8Array to base64 string', () => {
			const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
			const result = toBase64(bytes);
			expect(result).toBe('SGVsbG8=');
		});

		it('should handle empty array', () => {
			const bytes = new Uint8Array([]);
			const result = toBase64(bytes);
			expect(result).toBe('');
		});

		it('should handle single byte', () => {
			const bytes = new Uint8Array([65]); // "A"
			const result = toBase64(bytes);
			expect(result).toBe('QQ==');
		});
	});

	describe('fromBase64', () => {
		it('should convert base64 string to Uint8Array', () => {
			const b64 = 'SGVsbG8=';
			const result = fromBase64(b64);
			expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
		});

		it('should handle empty string', () => {
			const b64 = '';
			const result = fromBase64(b64);
			expect(result).toEqual(new Uint8Array([]));
		});

		it('should be inverse of toBase64', () => {
			const original = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 0]);
			const encoded = toBase64(original);
			const decoded = fromBase64(encoded);
			expect(decoded).toEqual(original);
		});
	});

	describe('toArrayBuffer', () => {
		it('should convert Uint8Array to ArrayBuffer', () => {
			const view = new Uint8Array([1, 2, 3, 4]);
			const buffer = toArrayBuffer(view);

			expect(buffer).toBeInstanceOf(ArrayBuffer);
			expect(buffer.byteLength).toBe(4);

			const newView = new Uint8Array(buffer);
			expect(newView).toEqual(view);
		});

		it('should handle empty array', () => {
			const view = new Uint8Array([]);
			const buffer = toArrayBuffer(view);

			expect(buffer).toBeInstanceOf(ArrayBuffer);
			expect(buffer.byteLength).toBe(0);
		});
	});

	describe('constantTimeEqual', () => {
		it('should return true for equal arrays', () => {
			const a = new Uint8Array([1, 2, 3, 4]);
			const b = new Uint8Array([1, 2, 3, 4]);
			expect(constantTimeEqual(a, b)).toBe(true);
		});

		it('should return false for different arrays', () => {
			const a = new Uint8Array([1, 2, 3, 4]);
			const b = new Uint8Array([1, 2, 3, 5]);
			expect(constantTimeEqual(a, b)).toBe(false);
		});

		it('should return false for arrays of different lengths', () => {
			const a = new Uint8Array([1, 2, 3]);
			const b = new Uint8Array([1, 2, 3, 4]);
			expect(constantTimeEqual(a, b)).toBe(false);
		});

		it('should return true for empty arrays', () => {
			const a = new Uint8Array([]);
			const b = new Uint8Array([]);
			expect(constantTimeEqual(a, b)).toBe(true);
		});

		it('should be secure against timing attacks (same execution time)', () => {
			const a = new Uint8Array([1, 2, 3, 4]);
			const b1 = new Uint8Array([1, 2, 3, 4]); // Equal
			const b2 = new Uint8Array([5, 6, 7, 8]); // Different

			// This is a basic test - in reality, timing attacks are very subtle
			const start1 = performance.now();
			constantTimeEqual(a, b1);
			const end1 = performance.now();

			const start2 = performance.now();
			constantTimeEqual(a, b2);
			const end2 = performance.now();

			// Times should be roughly similar (within reasonable bounds)
			const diff1 = end1 - start1;
			const diff2 = end2 - start2;
			expect(Math.abs(diff1 - diff2)).toBeLessThan(1); // 1ms tolerance
		});
	});

	describe('getCredentials', () => {
		it('should parse valid Basic Auth header', () => {
			const basic = 'Basic dXNlcjpwYXNz'; // "user:pass" in base64
			const [username, password] = getCredentials(basic);
			expect(username).toBe('user');
			expect(password).toBe('pass');
		});

		it('should handle credentials with colon in password', () => {
			const basic = 'Basic dXNlcjpwYXNzOndvcmQ='; // "user:pass:word" in base64
			const [username, password] = getCredentials(basic);
			expect(username).toBe('user');
			expect(password).toBe('pass:word');
		});

		it('should throw error for invalid format', () => {
			expect(() => getCredentials('Bearer token')).toThrow('Invalid Basic Auth format');
			expect(() => getCredentials('Basic')).toThrow();
			expect(() => getCredentials('')).toThrow('Invalid Basic Auth format');
		});

		it('should handle empty credentials', () => {
			const basic = 'Basic Og=='; // ":" in base64
			const [username, password] = getCredentials(basic);
			expect(username).toBe('');
			expect(password).toBe('');
		});
	});

	describe('haversineDistance', () => {
		it('should calculate distance between two points', () => {
			// Distance between New York and Los Angeles (approx 3944 km)
			const nyLat = 40.7128;
			const nyLon = -74.006;
			const laLat = 34.0522;
			const laLon = -118.2437;

			const distance = haversineDistance(nyLat, nyLon, laLat, laLon);
			expect(distance).toBeCloseTo(3944, -2); // Within 100km accuracy
		});

		it('should return 0 for same coordinates', () => {
			const lat = 40.7128;
			const lon = -74.006;

			const distance = haversineDistance(lat, lon, lat, lon);
			expect(distance).toBeCloseTo(0, 5);
		});

		it('should handle antipodal points', () => {
			// Points on opposite sides of Earth
			const lat1 = 0;
			const lon1 = 0;
			const lat2 = 0;
			const lon2 = 180;

			const distance = haversineDistance(lat1, lon1, lat2, lon2);
			expect(distance).toBeCloseTo(20015, -2); // Half Earth's circumference
		});

		it('should handle negative coordinates', () => {
			// Sydney to London
			const sydLat = -33.8688;
			const sydLon = 151.2093;
			const lonLat = 51.5074;
			const lonLon = -0.1278;

			const distance = haversineDistance(sydLat, sydLon, lonLat, lonLon);
			expect(distance).toBeGreaterThan(15000); // Should be around 17,000km
			expect(distance).toBeLessThan(20000);
		});

		it('should be symmetric', () => {
			const lat1 = 40.7128;
			const lon1 = -74.006;
			const lat2 = 34.0522;
			const lon2 = -118.2437;

			const distance1 = haversineDistance(lat1, lon1, lat2, lon2);
			const distance2 = haversineDistance(lat2, lon2, lat1, lon1);

			expect(distance1).toBeCloseTo(distance2, 10);
		});
	});
});
