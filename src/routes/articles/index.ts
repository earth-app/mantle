import { Hono } from 'hono';

import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../../openapi/schemas';
import * as tags from '../../openapi/tags';
import { validateMiddleware } from '../../util/validation';

// Articles Routes
import article from './article';
import createArticle from './create';

// Implementation
import Bindings from '../../bindings';
import { getArticles } from '../../util/routes/articles';

const articles = new Hono<{ Bindings: Bindings }>();

articles.get(
	'/',
	validateMiddleware('query', schemas.paginatedParams),
	describeRoute({
		summary: 'Get all articles',
		description: 'Retrieves a paginated list of all articles.',
		parameters: schemas.paginatedParameters,
		responses: {
			200: {
				description: 'A list of articles',
				content: {
					'application/json': {
						schema: resolver(schemas.paginated(schemas.article))
					}
				}
			},
			400: schemas.badRequest
		},
		tags: [tags.ARTICLES]
	}),
	async (c) => {
		const { page, limit, search } = c.req.valid('query');

		const articles = await getArticles(c.env.KV, page, limit, search);

		return c.json(
			{
				page: page,
				limit: limit,
				total: articles.length,
				items: articles
			},
			200
		);
	}
);

articles.route('/create', createArticle);
articles.route('/:articleId', article);

export default articles;
