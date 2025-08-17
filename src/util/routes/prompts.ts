import { allAllShards, createSchemaAcrossShards, first, KVShardMapper, run, runAllShards } from '@earth-app/collegedb';
import { com } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { DBError } from '../../types/errors';
import { Prompt, PromptResponse } from '../../types/prompts';
import { collegeDB, getAllInTable, getAllInTableWithFilter, getCountInTable, getCountInTableWithFilter, init } from '../collegedb';
import * as cache from './cache';
import { getUserById } from './users';

// Helpers

export function createPrompt(prompt: string, visibility: string, owner: string): Prompt {
	try {
		if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
			throw new HTTPException(400, { message: 'Prompt is required and must be a non-empty string.' });
		}

		const privacy = com.earthapp.account.Privacy.valueOf(visibility || 'PUBLIC');

		return {
			id: crypto.randomUUID(),
			owner_id: owner,
			prompt,
			visibility: privacy.name,
			created_at: new Date(),
			updated_at: new Date()
		};
	} catch (error) {
		if (error instanceof HTTPException) throw error;

		throw new HTTPException(400, { message: `Failed to create prompt: ${error instanceof Error ? error.message : 'Unknown error'}` });
	}
}

export function createPromptResponse(promptId: string, response: string, ownerId?: string): PromptResponse {
	try {
		if (!response || typeof response !== 'string' || response.trim() === '') {
			throw new HTTPException(400, { message: 'Response is required and must be a non-empty string.' });
		}

		return {
			id: crypto.randomUUID(),
			prompt_id: promptId,
			owner_id: ownerId,
			response,
			created_at: new Date(),
			updated_at: new Date()
		};
	} catch (error) {
		if (error instanceof HTTPException) throw error;

		throw new HTTPException(400, {
			message: `Failed to create prompt response: ${error instanceof Error ? error.message : 'Unknown error'}`
		});
	}
}

// Database

export async function healthCheck(bindings: Bindings) {
	try {
		await init(bindings);

		const query = `CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY NOT NULL UNIQUE,
            prompt TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'PUBLIC',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_prompts_owner_id ON prompts(owner_id);
        CREATE INDEX IF NOT EXISTS idx_prompts_prompt ON prompts(prompt);
        CREATE INDEX IF NOT EXISTS idx_prompts_visibility ON prompts(visibility);

        CREATE TABLE IF NOT EXISTS prompt_responses (
            id TEXT PRIMARY KEY NOT NULL UNIQUE,
            prompt_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            response TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prompt_id) REFERENCES prompts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_prompt_responses_prompt_id ON prompt_responses(prompt_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_responses_owner_id ON prompt_responses(owner_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_responses_response ON prompt_responses(response);
        CREATE INDEX IF NOT EXISTS idx_prompt_responses_created_at ON prompt_responses(created_at);`;

		await createSchemaAcrossShards(collegeDB.shards, query);
	} catch (error) {
		console.error(`Prompts Health check failed: ${error}`);
		return false;
	}

	return true;
}

export async function savePrompt(prompt: Prompt, bindings: Bindings): Promise<Prompt> {
	await init(bindings);

	try {
		const result = await run(prompt.id, `INSERT INTO prompts (id, prompt, visibility, owner_id) VALUES (?, ?, ?, ?)`, [
			prompt.id,
			prompt.prompt,
			prompt.visibility,
			prompt.owner_id
		]);

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to save prompt: ${result.error}` });
		}
		prompt.created_at = new Date();
		prompt.updated_at = new Date();

		await cache.clearCachePrefix(`prompts:`, bindings.KV_CACHE);
		await cache.clearCachePrefix(`prompts:count:`, bindings.KV_CACHE);

		return prompt;
	} catch (error) {
		throw new DBError(`Failed to create prompt: ${error}`);
	}
}

export async function updatePrompt(id: string, prompt: Prompt, bindings: Bindings): Promise<Prompt> {
	await init(bindings);

	const updatedAt = new Date();
	prompt.updated_at = updatedAt;

	try {
		const result = await run(id, `UPDATE prompts SET prompt = ?, visibility = ?, updated_at = ? WHERE id = ?`, [
			prompt.prompt,
			prompt.visibility,
			updatedAt,
			id
		]);

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to update prompt: ${result.error}` });
		}

		const obj = { ...prompt, id };

		await cache.clearCache(`prompt:${id}`, bindings.KV_CACHE);

		return obj;
	} catch (error) {
		throw new DBError(`Failed to update prompt: ${error}`);
	}
}

export async function deletePrompt(id: string, bindings: Bindings): Promise<void> {
	await init(bindings);

	try {
		const result = await run(id, `DELETE FROM prompts WHERE id = ?`);

		if (result.results.length === 0) {
			throw new HTTPException(404, { message: 'Prompt not found' });
		}

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to delete prompt: ${result.error}` });
		}

		const cacheKey = `prompt:${id}`;
		await cache.clearCache(cacheKey, bindings.KV_CACHE);
		await cache.clearCachePrefix(`prompts:count:`, bindings.KV_CACHE);

		const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
		mapper.deleteShardMapping(id);
	} catch (error) {
		throw new DBError(`Failed to delete prompt: ${error}`);
	}
}

export async function deleteExpiredPrompts(bindings: Bindings, days: number = 5) {
	await init(bindings);

	try {
		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() - days);
		const result = await runAllShards(`DELETE FROM prompts WHERE created_at < ?`, [expirationDate.toISOString()]);

		if (result.some((r) => r.error)) {
			throw new HTTPException(500, {
				message: `Failed to delete expired prompts: ${result
					.map((r) => r.error)
					.filter((e) => e)
					.join(', ')}`
			});
		}

		await cache.clearCachePrefix(`prompts:count:`, bindings.KV_CACHE);
	} catch (error) {
		throw new DBError(`Failed to delete expired prompts: ${error}`);
	}
}

export async function savePromptResponse(prompt: Prompt, response: PromptResponse, bindings: Bindings): Promise<PromptResponse> {
	await init(bindings);

	try {
		const result = await run(response.id, `INSERT INTO prompt_responses (id, prompt_id, owner_id, response) VALUES (?, ?, ?, ?)`, [
			response.id,
			prompt.id,
			response.owner_id,
			response.response
		]);
		if (result.error) {
			throw new DBError(`Failed to save prompt response: ${result.error}`);
		}

		response.created_at = new Date();
		response.updated_at = new Date();

		await cache.clearCachePrefix(`prompt_responses:${prompt.id}`, bindings.KV_CACHE);
		return response;
	} catch (error) {
		throw new DBError(`Failed to create prompt response: ${error}`);
	}
}

export async function updatePromptResponse(id: string, response: PromptResponse, bindings: Bindings): Promise<PromptResponse> {
	await init(bindings);

	const updatedAt = new Date();
	response.updated_at = updatedAt;

	try {
		const result = await run(id, `UPDATE prompt_responses SET response = ?, updated_at = ? WHERE id = ?`, [
			response.response,
			updatedAt,
			id
		]);

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to update prompt response: ${result.error}` });
		}

		const obj = { ...response, id };

		const cacheKey = `prompt_response:${id}`;
		await cache.clearCache(cacheKey, bindings.KV_CACHE);

		return obj;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to update prompt response: ${error}` });
	}
}

export async function deletePromptResponse(id: string, bindings: Bindings): Promise<void> {
	const cacheKey = `prompt_response:${id}`;
	await cache.clearCache(cacheKey, bindings.KV_CACHE);

	await init(bindings);

	try {
		const result = await run(id, `DELETE FROM prompt_responses WHERE id = ?`, [id]);

		if (result.results.length === 0) {
			throw new HTTPException(404, { message: 'Prompt response not found' });
		}

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to delete prompt response: ${result.error}` });
		}

		const mapper = new KVShardMapper(bindings.KV, { hashShardMappings: false });
		mapper.deleteShardMapping(id);
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to delete prompt response: ${error}` });
	}
}

// Prompt retrieval functions

export async function getPrompts(bindings: Bindings, limit: number = 25, page: number = 0, search: string = ''): Promise<Prompt[]> {
	const cacheKey = `prompts:${limit}:${page}:${search.trim().toLowerCase()}`;
	return cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
		const offset = page * limit;
		return await getAllInTable<Prompt>(bindings, 'prompts', 'created_at DESC', limit, offset, 'prompt', search);
	});
}

export async function getRandomPrompts(bindings: Bindings, limit: number = 10): Promise<Prompt[]> {
	await init(bindings);

	const query = `SELECT * FROM prompts ORDER BY RANDOM() LIMIT ?`;
	const results = await allAllShards<Prompt>(query, [limit]);

	const allPrompts: Prompt[] = [];
	results.forEach((result) => {
		// Sort random results by created_at in descending order
		allPrompts.push(...result.results);
	});

	return allPrompts
		.sort(() => Math.random() - 0.5) // Shuffle, then take limit
		.slice(0, limit)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Return sorted by created_at
}

export async function getPromptsCount(bindings: Bindings, search: string = ''): Promise<number> {
	const cacheKey = `prompts:count:${search.trim().toLowerCase()}`;
	return await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => await getCountInTable(bindings, 'prompts', 'prompt', search));
}

export async function getPromptById(id: string, bindings: Bindings): Promise<Prompt | null> {
	const cacheKey = `prompt:${id}`;

	return cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
		const query = `SELECT * FROM prompts WHERE id = ?`;
		const prompt = await first<Prompt>(id, query, [id]);
		if (!prompt) return null;
		return prompt;
	});
}

// Prompt response retrieval functions

export async function getPromptResponses(
	promptId: string,
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = ''
): Promise<PromptResponse[]> {
	const cacheKey = `prompt_responses:${promptId}:${limit}:${page}:${search.trim().toLowerCase()}`;

	return await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
		const offset = page * limit;
		return await getAllInTableWithFilter<PromptResponse>(
			bindings,
			'prompt_responses',
			'created_at DESC',
			limit,
			offset,
			'prompt_id',
			promptId,
			search ? 'response' : undefined,
			search || undefined
		);
	});
}

export async function getPromptResponsesCount(promptId: string, bindings: Bindings, search: string = ''): Promise<number> {
	const cacheKey = `prompt_responses:${promptId}:count:${search.trim().toLowerCase()}`;

	return await cache.tryCache(
		cacheKey,
		bindings.KV_CACHE,
		async () =>
			await getCountInTableWithFilter(
				bindings,
				'prompt_responses',
				'prompt_id',
				promptId,
				search ? 'response' : undefined,
				search || undefined
			)
	);
}

export async function getPromptResponseById(
	id: string,
	bindings: Bindings,
	ownerPrivacy: com.earthapp.account.Privacy
): Promise<PromptResponse | null> {
	const cacheKey = `prompt_response:${id}`;
	return await cache.tryCache(cacheKey, bindings.KV_CACHE, async () => {
		await init(bindings);

		const query = `SELECT * FROM prompt_responses WHERE id = ?`;
		const response = await first<PromptResponse>(id, query, [id]);

		if (!response) return null;

		if (response.owner_id) {
			const owner = await getUserById(response.owner_id, bindings, ownerPrivacy);
			if (!owner) return response;

			if (owner.account.visibility === com.earthapp.Visibility.PRIVATE || owner.account.isFieldPrivate('promptResponses', ownerPrivacy)) {
				response.owner_id = undefined; // Hide owner ID if privacy settings require it
			}
		}

		return response;
	});
}
