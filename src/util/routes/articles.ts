import { KVNamespace } from '@cloudflare/workers-types';
import { com } from '@earth-app/ocean';
import { Article } from '../../types/article';
import { DBError, ValidationError } from '../../types/errors';
import { User } from '../../types/users';
import { trimToByteLimit } from '../util';

// Helpers

type ArticleMetadata = {
	title: string;
	author: string;
	tags: string[];
	summary: string;
	published_at: number;
};

export function newArticleObject(article: Partial<Article>, user: User): Article {
	const id = com.earthapp.util.newIdentifier();
	const { title, description, tags, content, color } = article;
	if (!title || !description || !tags || !content) {
		throw new ValidationError('Missing required article fields');
	}

	if (!Array.isArray(tags) || tags.length === 0 || tags.length > 5) {
		throw new ValidationError('Tags must be an array with a maximum of 5 items');
	}

	return {
		id: `article:${id}`,
		article_id: id,
		title,
		description,
		tags,
		content,
		author: user.username,
		author_id: user.id,
		color: color || '#ffffff',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};
}

// Implementation

async function retrieveArticles(kv: KVNamespace, keys: string[]): Promise<Article[]> {
	const values = await kv.get<Article>(keys, 'json');
	return Array.from(values.values())
		.filter((value) => value !== null)
		.map((value) => value);
}

export async function getArticles(kv: KVNamespace, page: number = 1, limit: number = 25, search: string = ''): Promise<Article[]> {
	let keys: string[] = [];
	let cursor: string | undefined;
	let i = 0;

	while (i < page) {
		const result = await kv.list<ArticleMetadata>({ prefix: 'article:', limit, cursor });
		if (result.list_complete) break;

		cursor = result.cursor;
		keys = result.keys
			.filter((key) => {
				if (!search) return true;

				const metadata = key.metadata;
				if (!metadata) return false;

				return (
					metadata.title.toLowerCase().includes(search.toLowerCase()) ||
					metadata.author.toLowerCase().includes(search.toLowerCase()) ||
					metadata.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())) ||
					metadata.summary.includes(search)
				);
			})
			.map((key) => key.name);
		i++;
	}

	return await retrieveArticles(kv, keys);
}

export async function getArticle(kv: KVNamespace, id: string): Promise<Article | null> {
	const article = await kv.get<Article>(`article:${id}`, 'json');
	return article || null;
}

export async function newArticle(kv: KVNamespace, article: Article): Promise<Article> {
	// Max 1024 bytes; 2 bytes per character
	const metadata = {
		title: trimToByteLimit(article.title, 200), // Max 200 bytes
		author: trimToByteLimit(article.author, 100), // Max 100 bytes
		tags: article.tags.slice(0, 5).map((tag) => trimToByteLimit(tag, 30)), // Max 150 bytes (30 x 5)
		summary: trimToByteLimit(article.content, 512), // Max 512 bytes
		published_at: Date.now()
	} satisfies ArticleMetadata;

	// Assert Metadata is below 1024 bytes
	const byteSize = (obj: Record<string, any>) => {
		return new TextEncoder().encode(JSON.stringify(obj)).length;
	};
	if (byteSize(metadata) > 1024) {
		return Promise.reject(new DBError(`User Metadata for "${article.title}" exceeds 1024 bytes limit`));
	}

	await kv.put(article.id, JSON.stringify(article), { metadata });
	return article;
}

export async function updateArticle(kv: KVNamespace, id: string, article: Partial<Article>): Promise<Article | null> {
	const existingArticle = await getArticle(kv, id);
	if (!existingArticle) return null;

	const updatedArticle = { ...existingArticle, ...article };
	await kv.put(existingArticle.id, JSON.stringify(updatedArticle));
	return updatedArticle;
}

export async function deleteArticle(kv: KVNamespace, id: string): Promise<boolean> {
	const existingArticle = await getArticle(kv, id);
	if (!existingArticle) return false;

	await kv.delete(`article:${id}`);
	return true;
}
