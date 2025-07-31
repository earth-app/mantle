import { Hono } from 'hono';

import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import type { OpenAPIV3 } from 'openapi-types';
import zodToJsonSchema from 'zod-to-json-schema';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';

// Implementation
import { com } from '@earth-app/ocean';
import Bindings from '../../bindings';
import { getOwnerOfBearer, typeMiddleware } from '../../util/authentication';
import { newArticle, newArticleObject } from '../../util/routes/articles';

const createArticle = new Hono<{ Bindings: Bindings }>();

createArticle.post(
	'/',
	zValidator('json', schemas.articleCreate),
	describeRoute({
		summary: 'Create a new article',
		description: 'Creates a new article in the Earth App.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'Article object',
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.articleCreate) as OpenAPIV3.SchemaObject
				}
			}
		},
		responses: {
			201: {
				description: 'Article created successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.article)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden
		},
		tags: [tags.ARTICLES]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const article = c.req.valid('json');

		const user = await getOwnerOfBearer(c);
		if (!user) {
			return c.json(
				{
					code: 401,
					message: 'Unauthorized: Owner not found.'
				},
				401
			);
		}

		const obj = newArticleObject(article, user.public);
		const result = await newArticle(c.env.KV, obj);

		return c.json(result, 201);
	}
);

export default createArticle;
