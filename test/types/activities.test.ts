import { com } from '@earth-app/ocean';
import { describe, expect, it } from 'vitest';
import { toActivity } from '../../src/types/activities';
import { createActivity } from '../../src/util/routes/activities';

describe('Activities Types', () => {
	it('should convert object to type', () => {
		const obj = createActivity('test-activity-id', 'Test Activity', (activity) => {
			activity.description = 'A test activity for testing';
			activity.addType(com.earthapp.activity.ActivityType.OTHER);
		});

		const type = toActivity(obj, new Date(), new Date());

		expect(type).toBeDefined();
		expect(type.id).toBe(obj.id);
		expect(type.name).toBe(obj.name);
		expect(type.description).toBe(obj.description);
		expect(type.types).toEqual(obj.types.asJsArrayView().map((type) => type.name));
		expect(type.created_at).toBeDefined();
		expect(type.updated_at).toBeDefined();
	});

	it('should handle empty description', () => {
		try {
			createActivity('test-activity-id-empty-desc', 'Test Activity Empty Desc', (activity) => {
				activity.addType(com.earthapp.activity.ActivityType.OTHER);
			});
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain('Failed to create activity');
		}
	});

	it('should handle multiple types', () => {
		const obj = createActivity('test-activity-id-multiple-types', 'Test Activity Multiple Types', (activity) => {
			activity.description = 'An activity with multiple types';
			activity.addType(com.earthapp.activity.ActivityType.OTHER);
			activity.addType(com.earthapp.activity.ActivityType.WORK);
		});

		const type = toActivity(obj, new Date(), new Date());

		expect(type.types).toContain(com.earthapp.activity.ActivityType.OTHER.name);
		expect(type.types).toContain(com.earthapp.activity.ActivityType.WORK.name);
	});
});
