import { com } from '@earth-app/ocean';
import { describe, expect, it } from 'vitest';
import { toEvent } from '../../src/types/events';
import { createEvent } from '../../src/util/routes/events';

describe('Event Types', () => {
	it('should convert object to type', () => {
		const obj = createEvent('test-event-host-id', (event) => {
			event.name = 'Test Event';
			event.description = 'A test event for testing';
			event.location = new com.earthapp.event.Location(37.7749, -122.4194);
		});

		const type = toEvent(obj, new Date(), new Date());

		expect(type).toBeDefined();
		expect(type.id).toBe(obj.id);
		expect(type.name).toBe(obj.name);
		expect(type.description).toBe(obj.description);
		expect(type.created_at).toBeDefined();
		expect(type.updated_at).toBeDefined();
		expect(type.location?.latitude).toBe(37.7749);
		expect(type.location?.longitude).toBe(-122.4194);
	});

	it('should handle empty name', () => {
		try {
			createEvent('test-event-id-empty-name', (event) => {
				event.description = 'An event with an empty name';
			});
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain('Failed to create event');
		}
	});
});
