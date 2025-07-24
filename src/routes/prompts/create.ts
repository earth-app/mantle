import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { getOwnerOfBearer, typeMiddleware } from '../../util/authentication';
import { authRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import * as prompts from '../../util/routes/prompts';

const createPrompt = new Hono<{ Bindings: Bindings }>();

createPrompt.post(
	'/',
	authRateLimit(rateLimitConfigs.promptCreate),
	describeRoute({
		summary: 'Create a new prompt',
		description: 'Creates a new prompt in the Earth App.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.promptCreate) as OpenAPIV3.SchemaObject
				}
			},
			required: true
		},
		responses: {
			201: {
				description: 'Prompt created successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.prompt)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden
		},
		tags: [tags.PROMPTS]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const { prompt, visibility } = await c.req.json();

		if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
			return c.json(
				{
					code: 400,
					message: 'Prompt is required and must be a non-empty string.'
				},
				400
			);
		}

		if (visibility && typeof visibility !== 'string') {
			return c.json(
				{
					code: 400,
					message: 'Invalid visibility type.'
				},
				400
			);
		}

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Owner not found.'
				},
				401
			);
		}

		try {
			let newPrompt = prompts.createPrompt(prompt, visibility, owner.account.id);
			if (!newPrompt) {
				return c.json(
					{
						code: 500,
						message: 'Failed to create prompt.'
					},
					500
				);
			}

			newPrompt = await prompts.savePrompt(newPrompt, c.env.DB);
			return c.json(newPrompt, 201);
		} catch (error) {
			if (error instanceof HTTPException) throw error;
			console.error('Failed to create prompt:', error);

			return c.json(
				{
					code: 500,
					message: `Failed to create prompt: ${error instanceof Error ? error.message : 'Unknown error'}`
				},
				500
			);
		}
	}
);

export default createPrompt;
