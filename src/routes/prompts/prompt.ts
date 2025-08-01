import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';
import { validateMiddleware } from '../../util/validation';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../bindings';
import { getOwnerOfBearer, typeMiddleware } from '../../util/authentication';
import { authRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { globalRateLimit } from '../../util/ratelimit';
import * as prompts from '../../util/routes/prompts';
import { paginatedParameters } from '../../util/util';

const prompt = new Hono<{ Bindings: Bindings }>();

// Get Prompt
prompt.get(
	'/',
	describeRoute({
		summary: 'Retrieve a specific prompt by ID',
		description: 'Gets the details of a specific prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		responses: {
			200: {
				description: 'Prompt details',
				content: {
					'application/json': {
						schema: resolver(schemas.prompt)
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Prompt not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	async (c) => {
		const id = c.req.param('promptId');
		if (!id || Number.isNaN(id)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID is required and must be a valid number.'
				},
				400
			);
		}

		const promptId = parseInt(id, 10);
		if (promptId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID must be a positive integer.'
				},
				400
			);
		}

		const prompt = await prompts.getPromptById(promptId, c.env);
		if (!prompt) {
			return c.json(
				{
					code: 404,
					message: `Prompt with ID ${promptId} not found`
				},
				404
			);
		}

		return c.json(prompt, 200);
	}
);

// Edit Prompt
prompt.patch(
	'/',
	globalRateLimit(true),
	authRateLimit(rateLimitConfigs.promptUpdate),
	validateMiddleware('json', schemas.promptCreate),
	describeRoute({
		summary: 'Update a specific prompt by ID',
		description: 'Updates the details of a specific prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		requestBody: {
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.promptCreate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'Prompt updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.prompt)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Prompt not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const id = c.req.param('promptId');
		if (!id || Number.isNaN(id)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID is required and must be a valid number.'
				},
				400
			);
		}

		const promptId = parseInt(id, 10);
		if (promptId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID must be a positive integer.'
				},
				400
			);
		}

		const { prompt, visibility } = c.req.valid('json');

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Invalid or missing authentication token.'
				},
				401
			);
		}

		const existingPrompt = await prompts.getPromptById(promptId, c.env);
		if (!existingPrompt) {
			return c.json(
				{
					code: 404,
					message: `Prompt with ID ${promptId} not found`
				},
				404
			);
		}

		if (existingPrompt.owner_id !== owner.account.id) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to delete this prompt.'
				},
				403
			);
		}

		const updatedPrompt = await prompts.updatePrompt(
			promptId,
			{
				...existingPrompt,
				prompt,
				visibility: visibility as 'PRIVATE' | 'CIRCLE' | 'MUTUAL' | 'PUBLIC'
			},
			c.env
		);
		return c.json(updatedPrompt, 200);
	}
);

// Delete Prompt
prompt.delete(
	'/',
	globalRateLimit(true),
	describeRoute({
		summary: 'Delete a specific prompt by ID',
		description: 'Deletes a specific prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		responses: {
			204: {
				description: 'Prompt deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Prompt not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const id = c.req.param('promptId');
		if (!id || Number.isNaN(id)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID is required and must be a valid number.'
				},
				400
			);
		}

		const promptId = parseInt(id, 10);
		if (promptId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID must be a positive integer.'
				},
				400
			);
		}

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Invalid or missing authentication token.'
				},
				401
			);
		}

		const existingPrompt = await prompts.getPromptById(promptId, c.env);
		if (!existingPrompt) {
			return c.json(
				{
					code: 404,
					message: `Prompt with ID ${promptId} not found`
				},
				404
			);
		}

		if (existingPrompt.owner_id !== owner.account.id) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to delete this prompt.'
				},
				403
			);
		}

		await prompts.deletePrompt(promptId, c.env);
		return c.body(null, 204);
	}
);

// Get Prompt Responses
prompt.get(
	'/responses',
	describeRoute({
		summary: 'Get prompt responses',
		description: 'Retrieves all responses for a specific prompt.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			},
			...schemas.paginatedParameters
		],
		responses: {
			200: {
				description: 'List of prompt responses',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.promptResponse))
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Prompt not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	async (c) => {
		const id = c.req.param('promptId');
		if (!id || Number.isNaN(id)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID is required and must be a valid number.'
				},
				400
			);
		}

		const promptId = parseInt(id, 10);
		if (promptId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID must be a positive integer.'
				},
				400
			);
		}

		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

		const responses = await prompts.getPromptResponses(promptId, c.env, limit, page - 1, search);
		return c.json(responses, 200);
	}
);

// Create Prompt Response
prompt.post(
	'/responses',
	globalRateLimit(true),
	authRateLimit(rateLimitConfigs.promptResponseCreate),
	validateMiddleware('json', schemas.promptResponseBody),
	describeRoute({
		summary: 'Create a new prompt response',
		description: 'Creates a new response to a specific prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		requestBody: {
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.promptResponseBody) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			201: {
				description: 'Prompt response created successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.promptResponse)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Prompt not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const promptId = c.req.param('promptId');
		if (!promptId || Number.isNaN(promptId)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID is required and must be a valid number.'
				},
				400
			);
		}

		const id = parseInt(promptId, 10);
		if (id <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID and Response ID must be positive integers.'
				},
				400
			);
		}

		const { content } = c.req.valid('json');

		const existingPrompt = await prompts.getPromptById(id, c.env);
		if (!existingPrompt) {
			return c.json(
				{
					code: 404,
					message: `Prompt with ID ${id} not found`
				},
				404
			);
		}

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized'
				},
				401
			);
		}

		const promptResponse = prompts.createPromptResponse(id, content, owner.account.id);
		const response = await prompts.savePromptResponse(existingPrompt, promptResponse, c.env.DB);

		return c.json(response, 201);
	}
);

// Get Prompt Response by ID
prompt.get(
	'/responses/:responseId',
	describeRoute({
		summary: 'Get a specific prompt response by ID',
		description: 'Retrieves a specific response to a prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			},
			{
				name: 'responseId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		responses: {
			200: {
				description: 'Prompt response details',
				content: {
					'application/json': {
						schema: resolver(schemas.promptResponse)
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Prompt or response not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	async (c) => {
		const promptId = c.req.param('promptId');
		if (!promptId || Number.isNaN(promptId)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID is required and must be a valid number.'
				},
				400
			);
		}

		const responseId = c.req.param('responseId');
		if (!responseId || Number.isNaN(responseId)) {
			return c.json(
				{
					code: 400,
					message: 'Response ID is required and must be a valid number.'
				},
				400
			);
		}

		const id = parseInt(promptId, 10);
		const resId = parseInt(responseId, 10);
		if (id <= 0 || resId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID and Response ID must be positive integers.'
				},
				400
			);
		}

		const existingPrompt = await prompts.getPromptById(id, c.env);
		if (!existingPrompt) {
			return c.json(
				{
					code: 404,
					message: `Prompt with ID ${id} not found`
				},
				404
			);
		}

		const existingResponse = await prompts.getPromptResponseById(resId, c.env, com.earthapp.account.Privacy.PUBLIC);
		if (!existingResponse) {
			return c.json(
				{
					code: 404,
					message: `Response with ID ${resId} not found`
				},
				404
			);
		}

		if (existingPrompt.id !== existingResponse.prompt_id) {
			return c.json(
				{
					code: 404,
					message: `Response with ID ${resId} does not belong to prompt with ID ${id}`
				},
				404
			);
		}

		return c.json(existingResponse, 200);
	}
);

// Edit Prompt Response
prompt.patch(
	'/responses/:responseId',
	globalRateLimit(true),
	authRateLimit(rateLimitConfigs.promptResponseUpdate),
	validateMiddleware('json', schemas.promptResponseBody),
	describeRoute({
		summary: 'Update a specific prompt response by ID',
		description: 'Updates a specific response to a prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			},
			{
				name: 'responseId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		requestBody: {
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.promptResponseBody) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			200: {
				description: 'Prompt response updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.promptResponse)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Prompt or response not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const promptId = parseInt(c.req.param('promptId'), 10);
		const responseId = parseInt(c.req.param('responseId'), 10);

		if (Number.isNaN(promptId) || Number.isNaN(responseId)) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID and Response ID are required and must be valid numbers.'
				},
				400
			);
		}

		if (promptId <= 0 || responseId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Prompt ID and Response ID must be positive integers.'
				},
				400
			);
		}

		const { content: response } = c.req.valid('json');

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Invalid or missing authentication token.'
				},
				401
			);
		}

		const existingPrompt = await prompts.getPromptById(promptId, c.env);
		if (!existingPrompt) {
			return c.json(
				{
					code: 404,
					message: `Prompt with ID ${promptId} not found`
				},
				404
			);
		}

		if (existingPrompt.owner_id !== owner.account.id) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to update this prompt response.'
				},
				403
			);
		}

		const existingResponse = await prompts.getPromptResponseById(responseId, c.env, com.earthapp.account.Privacy.PUBLIC);
		if (!existingResponse) {
			return c.json(
				{
					code: 404,
					message: `Response with ID ${responseId} not found`
				},
				404
			);
		}

		await prompts.updatePromptResponse(responseId, { ...existingResponse, response }, c.env);
		return c.json(
			{
				code: 200,
				message: 'Prompt response updated successfully'
			},
			200
		);
	}
);

// Delete Prompt Response
prompt.delete(
	'/responses/:responseId',
	globalRateLimit(true),
	describeRoute({
		summary: 'Delete a specific prompt response by ID',
		description: 'Deletes a specific response to a prompt in the Earth App.',
		parameters: [
			{
				name: 'promptId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			},
			{
				name: 'responseId',
				in: 'path',
				required: true,
				schema: schemas.idNumberParam
			}
		],
		responses: {
			204: {
				description: 'Prompt response deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Prompt or response not found'
			}
		},
		tags: [tags.PROMPTS]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const responseId = parseInt(c.req.param('responseId'), 10);

		if (Number.isNaN(responseId)) {
			return c.json(
				{
					code: 400,
					message: 'Response ID is required and must be a valid number.'
				},
				400
			);
		}

		if (responseId <= 0) {
			return c.json(
				{
					code: 400,
					message: 'Response ID must be a positive integer.'
				},
				400
			);
		}

		const owner = await getOwnerOfBearer(c);
		if (!owner) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Invalid or missing authentication token.'
				},
				401
			);
		}

		const existingResponse = await prompts.getPromptResponseById(responseId, c.env, com.earthapp.account.Privacy.PUBLIC);
		if (!existingResponse) {
			return c.json(
				{
					code: 404,
					message: `Response with ID ${responseId} not found`
				},
				404
			);
		}

		if (existingResponse.owner_id !== owner.account.id) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to delete this prompt response.'
				},
				403
			);
		}

		await prompts.deletePromptResponse(responseId, c.env);
		return c.body(null, 204);
	}
);

export default prompt;
