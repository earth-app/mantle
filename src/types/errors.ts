export class DBError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DBError';
	}
}
export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}
