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
import { ipRateLimit, rateLimitConfigs } from '../../util/kv-ratelimit';
import { deleteArticle, getArticle, updateArticle } from '../../util/routes/articles';

const article = new Hono<{ Bindings: Bindings }>();

// Get Article
article.get(
	'/',
	validateMiddleware('param', schemas.id),
	describeRoute({
		summary: 'Get an article',
		description: 'Retrieves an article from the Earth App.',
		parameters: [
			{
				name: 'articleId',
				in: 'path',
				required: true,
				schema: {
					type: 'string',
					description: 'ID of the article to retrieve'
				}
			}
		],
		responses: {
			200: {
				description: 'Article retrieved successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.article)
					}
				}
			},
			400: schemas.badRequest,
			404: {
				description: 'Article not found'
			}
		},
		tags: [tags.ARTICLES]
	}),
	async (c) => {
		const articleId = c.req.valid('param');
		const article = await getArticle(c.env.KV, articleId);

		if (!article) {
			return c.json(
				{
					code: 404,
					message: `Article with ID ${articleId} not found.`
				},
				404
			);
		}

		return c.json(article, 200);
	}
);

// Update Article
article.patch(
	'/',
	ipRateLimit(rateLimitConfigs.articleUpdate),
	validateMiddleware('param', schemas.id),
	validateMiddleware('json', schemas.articleUpdate),
	describeRoute({
		summary: 'Update an article',
		description: 'Updates an article in the Earth App.',
		security: [{ BearerAuth: [] }],
		requestBody: {
			description: 'Article object with updated fields',
			content: {
				'application/json': {
					schema: zodToJsonSchema(schemas.articleUpdate) as OpenAPIV3.SchemaObject
				}
			}
		},
		parameters: [
			{
				name: 'articleId',
				in: 'path',
				required: true,
				schema: {
					type: 'string',
					description: 'ID of the article to update'
				}
			}
		],
		responses: {
			200: {
				description: 'Article updated successfully',
				content: {
					'application/json': {
						schema: resolver(schemas.article)
					}
				}
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Article not found'
			}
		},
		tags: [tags.ARTICLES]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const articleId = c.req.valid('param');
		const body = c.req.valid('json');

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

		const article = await getArticle(c.env.KV, articleId);
		if (!article) {
			return c.json(
				{
					code: 404,
					message: `Article with ID ${articleId} not found.`
				},
				404
			);
		}

		if (!user.account.isAdmin && article.author_id !== user.account.id) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to update this article.'
				},
				403
			);
		}

		const updatedArticle = {
			...article,
			...body,
			updated_at: new Date().toISOString()
		};

		const result = await updateArticle(c.env.KV, articleId, updatedArticle);
		if (!result) {
			return c.json(
				{
					code: 404,
					message: `Article with ID ${articleId} not found.`
				},
				404
			);
		}

		return c.json(result, 200);
	}
);

// Delete Article
article.delete(
	'/',
	validateMiddleware('param', schemas.id),
	describeRoute({
		summary: 'Delete an article',
		description: 'Deletes an article from the Earth App.',
		security: [{ BearerAuth: [] }],
		parameters: [
			{
				name: 'articleId',
				in: 'path',
				required: true,
				schema: {
					type: 'string',
					description: 'ID of the article to delete'
				}
			}
		],
		responses: {
			204: {
				description: 'Article deleted successfully'
			},
			400: schemas.badRequest,
			401: schemas.unauthorized,
			403: schemas.forbidden,
			404: {
				description: 'Article not found'
			}
		},
		tags: [tags.ARTICLES]
	}),
	typeMiddleware(com.earthapp.account.AccountType.WRITER),
	async (c) => {
		const articleId = c.req.valid('param');

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

		const article = await getArticle(c.env.KV, articleId);
		if (!article) {
			return c.json(
				{
					code: 404,
					message: `Article with ID ${articleId} not found.`
				},
				404
			);
		}

		if (!user.account.isAdmin && article.author_id !== user.account.id) {
			return c.json(
				{
					code: 403,
					message: 'Forbidden: You do not have permission to delete this article.'
				},
				403
			);
		}

		await deleteArticle(c.env.KV, articleId);
		return c.body(null, 204);
	}
);

export default article;
