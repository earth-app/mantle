import { com } from '@earth-app/ocean';

export type Prompt = {
	id: bigint;
	owner_id: string;
	prompt: string;
	visibility: typeof com.earthapp.account.Privacy.prototype.name;
	created_at: Date;
	updated_at?: Date;
};

export type PromptResponse = {
	id: bigint;
	prompt_id: bigint;
	owner_id?: string;
	response: string;
	created_at: Date;
	updated_at?: Date;
};
