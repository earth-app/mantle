import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import z from 'zod';
import * as schemas from '../openapi/schemas';
import * as tags from '../openapi/tags';

import Bindings from '../bindings';

import { adminMiddleware, healthCheck as authenticationHealthCheck } from '../util/authentication';
import { healthCheck as activitiesHealthCheck } from '../util/routes/activities';
import { healthCheck as articlesHealthCheck } from '../util/routes/articles';
import { healthCheck as cacheHealthCheck } from '../util/routes/cache';
import { healthCheck as eventsHealthCheck } from '../util/routes/events';
import { healthCheck as promptsHealthCheck } from '../util/routes/prompts';
import { healthCheck as usersHealthCheck } from '../util/routes/users';

const healthCheck = new Hono<{ Bindings: Bindings }>();

healthCheck.get(
	'/',
	adminMiddleware(),
	describeRoute({
		summary: 'Perform a health check on the server [Admin Only]',
		description:
			'Performs a health check to ensure the server is running and accessible. In addition, validates the state of the database, KV, and other critical services.',
		responses: {
			200: {
				description: 'Health check successful',
				content: {
					'application/json': {
						schema: resolver(
							z.object({
								cache: z.boolean(),
								database: z.object({
									activities: z.boolean(),
									events: z.boolean(),
									users: z.boolean(),
									prompts: z.boolean(),
									authentication: z.boolean()
								}),
								kv: z.object({
									articles: z.boolean()
								})
							})
						)
					}
				}
			},
			401: schemas.unauthorized,
			403: schemas.forbidden,
			500: {
				description: 'Health check failed',
				content: {
					'application/json': {
						schema: resolver(
							z.object({
								code: z.number().int().min(500).max(500),
								message: z.string()
							})
						)
					}
				}
			}
		},
		tags: [tags.GENERAL]
	}),
	async (c) => {
		try {
			return c.json(
				{
					cache: await cacheHealthCheck(c.env),
					database: {
						activities: await activitiesHealthCheck(c.env),
						events: await eventsHealthCheck(c.env),
						users: await usersHealthCheck(c.env),
						prompts: await promptsHealthCheck(c.env),
						authentication: await authenticationHealthCheck(c.env)
					},
					kv: {
						articles: await articlesHealthCheck(c.env)
					}
				},
				200
			);
		} catch (error) {
			return c.json(
				{
					code: 500,
					message: 'Health check failed'
				},
				500
			);
		}
	}
);

export default healthCheck;
