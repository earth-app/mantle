export type Prompt = {
	id: number;
	prompt: string;
	created_at?: Date;
	updated_at?: Date;
};

export type PromptResponse = {
	id: number;
	prompt_id: number;
	response: string;
	created_at?: Date;
	updated_at?: Date;
};
