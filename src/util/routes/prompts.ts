import { HTTPException } from 'hono/http-exception';
import { Prompt, PromptResponse } from '../../types/prompts';

// Database

export async function checkTableExists(d1: D1Database) {
	const promptQuery = `CREATE TABLE IF NOT EXISTS prompts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		prompt TEXT NOT NULL,
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

	const promptResponseQuery = `CREATE TABLE IF NOT EXISTS prompt_responses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		prompt_id INTEGER NOT NULL,
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

async function findPromptResponse(query: string, d1: D1Database, ...params: any[]): Promise<PromptResponse[]> {
	await checkTableExists(d1);

	const row = await d1
		.prepare(query)
		.bind(...params)
		.all<PromptResponse>();

	if (row.error) {
		throw new HTTPException(500, { message: `Failed to find prompt responses: ${row.error}` });
	}

	return row.results;
}

export async function savePrompt(d1: D1Database, prompt: Prompt): Promise<Prompt> {
	await checkTableExists(d1);

	try {
		const result = await d1.prepare(`INSERT INTO prompts (prompt) VALUES (?)`).bind(prompt.prompt).run();

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

export async function updatePrompt(d1: D1Database, id: number, prompt: Prompt): Promise<Prompt> {
	await checkTableExists(d1);

	try {
		const result = await d1.prepare(`UPDATE prompts SET prompt = ?, updated_at = ? WHERE id = ?`).bind(prompt.prompt, new Date(), id).run();

		if (result.error) {
			throw new HTTPException(500, { message: `Failed to update prompt: ${result.error}` });
		}

		return { ...prompt, id };
	} catch (error) {
		throw new HTTPException(400, { message: `Failed to update prompt: ${error}` });
	}
}

// Prompt retrieval functions

export async function getPrompts(d1: D1Database): Promise<Prompt[]> {
	const query = `SELECT * FROM prompts ORDER BY created_at DESC`;
	return findPrompt(query, d1);
}

export async function getPromptById(d1: D1Database, id: number): Promise<Prompt | null> {
	const query = `SELECT * FROM prompts WHERE id = ?`;
	const prompts = await findPrompt(query, d1, id);
	return prompts.length > 0 ? prompts[0] : null;
}
