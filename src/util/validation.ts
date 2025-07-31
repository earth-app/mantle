import { zValidator } from '@hono/zod-validator';
import { ValidationTargets } from 'hono';
import { ZodSchema } from 'zod';

export function validateMiddleware(key: keyof ValidationTargets, schema: ZodSchema) {
	return zValidator(key, schema, (result, c) => {
		if (!result.success) {
			return c.json(
				{
					code: 400,
					message: result.error.message,
					details: result.error.errors
				},
				400
			);
		}
	});
}
