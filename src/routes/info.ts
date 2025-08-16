import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as schemas from '../openapi/schemas';
import * as tags from '../openapi/tags';

import * as packageJson from '../../package.json';
import Bindings from '../bindings';

const info = new Hono<{ Bindings: Bindings }>();

info.get(
	'/',
	describeRoute({
		summary: 'Get information about the API',
		description: 'Get information about the API',
		responses: {
			200: {
				description: 'Information about the API',
				content: {
					'application/json': {
						schema: resolver(schemas.info)
					}
				}
			}
		},
		tags: [tags.GENERAL]
	}),
	async (c) => {
		return c.json({
			name: packageJson.name,
			title: 'Earth App',
			version: packageJson.version,
			description: packageJson.description,
			date: new Date().toISOString()
		});
	}
);

export default info;
