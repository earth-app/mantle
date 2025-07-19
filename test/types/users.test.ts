import { com } from '@earth-app/ocean';
import { describe, expect, it } from 'vitest';
import { toUser } from '../../src/types/users';
import { createUser } from '../../src/util/routes/users';

describe('User Types', () => {
	it('should convert object to type', () => {
		const obj = createUser('testusername', (user) => {
			user.firstName = 'Test';
			user.lastName = 'User';
			user.email = 'example@user.com';
			user.phoneNumber = 1234567890;
			user.address = '123 Test St';
			user.visibility = com.earthapp.Visibility.PUBLIC;
		});

		const type = toUser(obj, com.earthapp.account.Privacy.PRIVATE, new Date(), new Date(), new Date());

		expect(type).toBeDefined();
		expect(type.id).toBe(obj.id);
		expect(type.username).toBe(obj.username);
		expect(type.fullName).toBe('Test User');
		expect(type.created_at).toBeDefined();
		expect(type.updated_at).toBeDefined();
		expect(type.account.firstName).toBe('Test');
		expect(type.account.lastName).toBe('User');
		expect(type.account.email).toBe('example@user.com');
		expect(type.account.phone_number).toBe(1234567890);
		expect(type.account.address).toBe('123 Test St');
		expect(type.account.visibility).toBe(com.earthapp.Visibility.PUBLIC.name);
	});

	it('should handle empty username', () => {
		try {
			createUser('', (user) => {
				user.firstName = 'Test';
				user.lastName = 'User';
			});
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain('Failed to create user');
		}
	});

	it('should handle field privacy', () => {
		const obj = createUser('testusername-privacy', (user) => {
			user.firstName = 'Test';
			user.lastName = 'User';
			user.bio = 'Bio available to circle';
			user.email = 'private@email.com';

			user.setFieldPrivacy('bio', com.earthapp.account.Privacy.CIRCLE);
			user.setFieldPrivacy('email', com.earthapp.account.Privacy.PRIVATE);
		});

		const type = toUser(obj, com.earthapp.account.Privacy.CIRCLE, new Date(), new Date(), new Date());
		expect(type.account.field_privacy.email).toBe(com.earthapp.account.Privacy.PRIVATE.name);
		expect(type.account.field_privacy.bio).toBe(com.earthapp.account.Privacy.CIRCLE.name);
		expect(type.account.email).toBeUndefined(); // Should not be visible due to privacy setting
		expect(type.account.bio).toBe('Bio available to circle'); // Should be visible to circle
	});
});
