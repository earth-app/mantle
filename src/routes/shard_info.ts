import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import * as tags from '../openapi/tags';

import { getShardStats } from '@earth-app/collegedb';
import z from 'zod';
import Bindings from '../bindings';
import { init } from '../util/collegedb';

const shardInfo = new Hono<{ Bindings: Bindings }>();

shardInfo.get(
	'/',
	describeRoute({
		summary: 'Get information about the database shards',
		description: 'Get information about the database shards',
		responses: {
			200: {
				description: 'Information about the API',
				content: {
					'application/json': {
						schema: resolver(z.array(z.object({ binding: z.string(), count: z.number() })))
					}
				}
			}
		},
		tags: [tags.GENERAL]
	}),
	async (c) => {
		await init(c.env);
		return c.json(await getShardStats(), 200);
	}
);

export default shardInfo;
