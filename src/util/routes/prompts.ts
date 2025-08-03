import { com } from '@earth-app/ocean';
import { HTTPException } from 'hono/http-exception';
import Bindings from '../../bindings';
import { Prompt, PromptResponse } from '../../types/prompts';
import { cache, clearCache, tryCache } from './cache';
import { getUserById } from './users';

// Helpers

export function createPrompt(prompt: string, visibility: string, owner: string): Prompt {
	try {
		if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
			throw new HTTPException(400, { message: 'Prompt is required and must be a non-empty string.' });
		}

		const privacy = com.earthapp.account.Privacy.valueOf(visibility || 'PUBLIC');

		return {
			id: -1, // Placeholder ID, will be set by the database
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

export function createPromptResponse(promptId: number, response: string, ownerId?: string): PromptResponse {
	try {
		if (!response || typeof response !== 'string' || response.trim() === '') {
			throw new HTTPException(400, { message: 'Response is required and must be a non-empty string.' });
		}

		return {
			id: -1, // Placeholder ID, will be set by the database
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

export async function checkTableExists(d1: D1Database) {
	const promptQuery = `CREATE TABLE IF NOT EXISTS prompts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		prompt TEXT NOT NULL,
		owner_id TEXT NOT NULL,
		visibility TEXT NOT NULL DEFAULT 'PUBLIC',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`;

	const promptResult = await d1.prepare(promptQuery).run();
	if (promptResult.error) {
		throw new HTTPException(500, { message: `Failed to create prompts table: ${promptResult.error}` });
	}

	// Indexes for performance
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_prompts_prompt ON prompts(prompt)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_prompts_owner_id ON prompts(owner_id)`).run();

	const promptResponseQuery = `CREATE TABLE IF NOT EXISTS prompt_responses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		prompt_id INTEGER NOT NULL,
		owner_id TEXT NOT NULL,
		response TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (prompt_id) REFERENCES prompts(id)
		)`;
	const promptResponseResult = await d1.prepare(promptResponseQuery).run();
	if (promptResponseResult.error) {
		throw new HTTPException(500, { message: `Failed to create prompt_responses table: ${promptResponseResult.error}` });
	}

	// Indexes for performance
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_prompt_responses_prompt_id ON prompt_responses(prompt_id)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_prompt_responses_response ON prompt_responses(response)`).run();
	await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_prompt_responses_created_at ON prompt_responses(created_at)`).run();
}

async function findPrompt(query: string, d1: D1Database, ...params: any[]): Promise<Prompt[]> {
	await checkTableExists(d1);

	const row = await d1
		.prepare(query)
		.bind(...params)
		.all<Prompt>();

	if (row.error) {
		throw new HTTPException(500, { message: `Failed to find prompts: ${row.error}` });
	}

	return row.results;
}

async function findPromptResponse(
	query: string,
	ownerPrivacy: com.earthapp.account.Privacy,
	bindings: Bindings,
	...params: any[]
): Promise<PromptResponse[]> {
	await checkTableExists(bindings.DB);

	const row = await bindings.DB.prepare(query)
		.bind(...params)
		.all<PromptResponse>();

	if (row.error) {
		throw new HTTPException(500, { message: `Failed to find prompt responses: ${row.error}` });
	}

	return Promise.all(
		row.results.map(async (response) => {
			if (!response.owner_id) return response;

			const owner = await getUserById(response.owner_id, bindings, ownerPrivacy);
			if (!owner) {
				throw new HTTPException(404, { message: `Owner not found for response ID ${response.id}` });
			}

			if (owner.account.isFieldPrivate('promptResponses', ownerPrivacy)) {
				response.owner_id = undefined; // Hide owner ID if privacy settings require it
			}

			return response;
		})
	);
}

export async function savePrompt(prompt: Prompt, d1: D1Database): Promise<Prompt> {
	await checkTableExists(d1);

	try {
		const result = await d1
			.prepare(`INSERT INTO prompts (prompt, visibility, owner_id) VALUES (?, ?, ?)`)
			.bind(prompt.prompt, prompt.visibility, prompt.owner_id)
			.run();

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to save prompt: ${result.error}` });
		}
		prompt.created_at = new Date();
		prompt.updated_at = new Date();

		return prompt;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to create prompt: ${error}` });
	}
}

export async function updatePrompt(id: number, prompt: Prompt, bindings: Bindings): Promise<Prompt> {
	const d1 = bindings.DB;
	await checkTableExists(d1);

	const updatedAt = new Date();
	prompt.updated_at = updatedAt;

	try {
		const result = await d1
			.prepare(`UPDATE prompts SET prompt = ?, visibility = ?, updated_at = ? WHERE id = ?`)
			.bind(prompt.prompt, prompt.visibility, updatedAt, id)
			.run();

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to update prompt: ${result.error}` });
		}

		const obj = { ...prompt, id };

		const cacheKey = `prompt:${id}`;
		cache(cacheKey, obj, bindings.KV_CACHE);

		return obj;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to update prompt: ${error}` });
	}
}

export async function deletePrompt(id: number, bindings: Bindings): Promise<void> {
	const d1 = bindings.DB;
	await checkTableExists(d1);

	try {
		const result = await d1.prepare(`DELETE FROM prompts WHERE id = ?`).bind(id).run();

		if (result.results.length === 0) {
			throw new HTTPException(404, { message: 'Prompt not found' });
		}

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to delete prompt: ${result.error}` });
		}

		const cacheKey = `prompt:${id}`;
		await clearCache(cacheKey, bindings.KV_CACHE);
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to delete prompt: ${error}` });
	}
}

export async function savePromptResponse(prompt: Prompt, response: PromptResponse, d1: D1Database): Promise<PromptResponse> {
	await checkTableExists(d1);

	try {
		const result = await d1
			.prepare(`INSERT INTO prompt_responses (prompt_id, owner_id, response) VALUES (?, ?, ?)`)
			.bind(prompt.id, response.owner_id, response.response)
			.run();

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to save prompt response: ${result.error}` });
		}

		response.created_at = new Date();
		response.updated_at = new Date();
		return response;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to create prompt response: ${error}` });
	}
}

export async function updatePromptResponse(id: number, response: PromptResponse, bindings: Bindings): Promise<PromptResponse> {
	const d1 = bindings.DB;
	await checkTableExists(d1);

	const updatedAt = new Date();
	response.updated_at = updatedAt;

	try {
		const result = await d1
			.prepare(`UPDATE prompt_responses SET response = ?, updated_at = ? WHERE id = ?`)
			.bind(response.response, updatedAt, id)
			.run();

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to update prompt response: ${result.error}` });
		}

		const obj = { ...response, id };

		const cacheKey = `prompt_response:${id}`;
		cache(cacheKey, obj, bindings.KV_CACHE);

		return obj;
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to update prompt response: ${error}` });
	}
}

export async function deletePromptResponse(id: number, bindings: Bindings): Promise<void> {
	const cacheKey = `prompt_response:${id}`;
	await clearCache(cacheKey, bindings.KV_CACHE);

	const d1 = bindings.DB;
	await checkTableExists(d1);

	try {
		const result = await d1.prepare(`DELETE FROM prompt_responses WHERE id = ?`).bind(id).run();

		if (result.results.length === 0) {
			throw new HTTPException(404, { message: 'Prompt response not found' });
		}

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to delete prompt response: ${result.error}` });
		}
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to delete prompt response: ${error}` });
	}
}

// Prompt retrieval functions

export async function getPrompts(bindings: Bindings, limit: number = 25, page: number = 0, search: string = ''): Promise<Prompt[]> {
	const cacheKey = `prompts:${limit}:${page}:${search.trim().toLowerCase()}`;
	return tryCache(cacheKey, bindings.KV_CACHE, async () => {
		const d1 = bindings.DB;
		const query = `SELECT * FROM prompts${search ? ` WHERE prompt LIKE ?` : ''} ORDER BY date DESC LIMIT ? OFFSET ?`;
		let results: Prompt[];

		if (search) results = await findPrompt(query, d1, `%${search}%`, limit, page * limit);
		else results = await findPrompt(query, d1, limit, page * limit);

		return results;
	});
}

export async function getPromptsCount(bindings: Bindings, search: string = ''): Promise<number> {
	await checkTableExists(bindings.DB);
	const query = `SELECT COUNT(*) as count FROM prompts${search ? ' WHERE prompt LIKE ?' : ''}`;
	const params = search ? [`%${search.trim().toLowerCase()}%`] : [];
	const result = await bindings.DB.prepare(query)
		.bind(...params)
		.first<{ count: number }>();

	return result?.count ?? 0;
}

export async function getPromptById(id: number, bindings: Bindings): Promise<Prompt | null> {
	const cacheKey = `prompt:${id}`;

	return tryCache(cacheKey, bindings.KV_CACHE, async () => {
		const d1 = bindings.DB;
		const query = `SELECT * FROM prompts WHERE id = ?`;
		const prompts = await findPrompt(query, d1, id);
		return prompts.length > 0 ? prompts[0] : null;
	});
}

// Prompt response retrieval functions

export async function getPromptResponses(
	promptId: number,
	bindings: Bindings,
	limit: number = 25,
	page: number = 0,
	search: string = ''
): Promise<PromptResponse[]> {
	const query = `SELECT * FROM prompt_responses WHERE prompt_id = ?${search ? ' AND response LIKE ?' : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
	let results: PromptResponse[];

	if (search)
		results = await findPromptResponse(query, com.earthapp.account.Privacy.PUBLIC, bindings, promptId, `%${search}%`, limit, page * limit);
	else results = await findPromptResponse(query, com.earthapp.account.Privacy.PUBLIC, bindings, promptId, limit, page * limit);

	return results;
}

export async function getPromptResponseById(
	id: number,
	bindings: Bindings,
	ownerPrivacy: com.earthapp.account.Privacy
): Promise<PromptResponse | null> {
	const query = `SELECT * FROM prompt_responses WHERE id = ?`;
	const responses = await findPromptResponse(query, ownerPrivacy, bindings, id);
	return responses.length > 0 ? responses[0] : null;
}
