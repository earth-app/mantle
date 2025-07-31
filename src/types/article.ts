export type OceanArticle = {
	title: string;
	author: string;
	source: string;
	url: string;
	abstract: string;
	content: string;
	theme_color: string;
	keywords: string[];
	date: string;
	favicon: string;
	links: {
		[key: string]: string;
	};
};

export type Article = {
	id: string;
	article_id: string;
	title: string;
	description: string;
	tags: string[];
	content: string;
	author: string;
	author_id: string;
	color: string;
	created_at: string;
	updated_at?: string;
	ocean?: OceanArticle;
};
