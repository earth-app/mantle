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
import { getPrompts } from '../../util/routes/prompts';
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

		const prompts = await getPrompts(c.env.DB, limit, page - 1, search);
		return c.json(prompts);
	}
);

prompts.route('/create', createPrompt);
prompts.route('/:promptId', prompt);

export default prompts;
