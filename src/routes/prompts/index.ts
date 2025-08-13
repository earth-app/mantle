import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// Prompt Routes
import createPrompt from './create';
import prompt from './prompt';

// Implementation
import Bindings from '../../bindings';
import { ipRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { getPrompts, getPromptsCount, getRandomPrompts } from '../../util/routes/prompts';
import { paginatedParameters } from '../../util/util';

const prompts = new Hono<{ Bindings: Bindings }>();

prompts.get(
	'/',
	describeRoute({
		summary: 'Retrieve a paginated list of all prompts',
		description: 'Gets a paginated list of all prompts in the Earth App.',
		parameters: schemas.paginatedParameters,
		responses: {
			200: {
				description: 'List of prompts',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.prompt))
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.PROMPTS]
	}),
	async (c) => {
		const params = paginatedParameters(c);
		if (params.code && params.message) {
			return c.json({ code: params.code, message: params.message }, params.code);
		}

		const { page, limit, search } = params;

		const prompts = await getPrompts(c.env, limit, page - 1, search);
		return c.json(
			{
				page: page,
				limit: limit,
				total: await getPromptsCount(c.env, search),
				items: prompts
			},
			200
		);
	}
);

prompts.get(
	'/random',
	ipRateLimit(rateLimitConfigs.randomPromptRefresh),
	describeRoute({
		summary: 'Retrieve a random list of prompts',
		description: 'Gets a random list of prompts from the Earth App.',
		parameters: [
			{
				in: 'query',
				name: 'limit',
				description: 'Number of random prompts to return',
				required: false,
				schema: {
					type: 'integer',
					default: 10,
					minimum: 1,
					maximum: 100
				}
			}
		],
		responses: {
			200: {
				description: 'List of random prompts',
				content: {
					'application/json': {
						schema: resolver(schemas.prompts)
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.PROMPTS]
	}),
	async (c) => {
		const limit = parseInt(c.req.query('limit') || '10', 10);
		if (isNaN(limit) || limit < 1 || limit > 100) {
			return c.json(
				{
					code: 400,
					message: 'Limit must be an integer between 1 and 100'
				},
				400
			);
		}

		const prompts = await getRandomPrompts(c.env, limit);
		return c.json(prompts, 200);
	}
);

prompts.route('/create', createPrompt);
prompts.route('/:promptId', prompt);

export default prompts;
