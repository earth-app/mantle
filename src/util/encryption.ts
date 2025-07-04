import { fromBase64, toArrayBuffer, toBase64 } from './util';

export async function generateKey() {
	const key = crypto.getRandomValues(new Uint8Array(32));
	const iv = crypto.getRandomValues(new Uint8Array(12));

	return {
		rawKey: key,
		key: toBase64(key),
		iv: toBase64(iv)
	};
}

export async function encryptKey(kek: string, key: string) {
	const kekRaw = fromBase64(kek);
	const kekKey = await crypto.subtle.importKey('raw', kekRaw, 'AES-GCM', false, ['encrypt']);

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const algorithm = { name: 'AES-GCM', iv };

	const encryptedKey = await crypto.subtle.encrypt(algorithm, kekKey, fromBase64(key));
	return {
		key: toBase64(new Uint8Array(encryptedKey)),
		iv: toBase64(iv)
	};
}

export async function decryptKey(kek: string, encryptedKey: { key: string; iv: string }) {
	const kekRaw = fromBase64(kek);
	const kekKey = await crypto.subtle.importKey('raw', kekRaw, 'AES-GCM', false, ['decrypt']);

	const iv = fromBase64(encryptedKey.iv);
	const encryptedBytes = fromBase64(encryptedKey.key);

	const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kekKey, encryptedBytes);
	return new Uint8Array(decrypted);
}

export async function encryptData(key: Uint8Array, data: Uint8Array, iv: Uint8Array) {
	if (!key || data.length === 0) throw new Error('Data cannot be empty');
	if (!data || key.length === 0) throw new Error('Key cannot be empty');
	if (!iv || iv.length === 0) throw new Error('IV cannot be empty');

	const algorithm = { name: 'AES-GCM', iv };
	const keyObj = await crypto.subtle.importKey('raw', key, algorithm, false, ['encrypt']);

	const encryptedData = await crypto.subtle.encrypt(algorithm, keyObj, data);
	return new Uint8Array(encryptedData);
}

export async function decryptData(key: Uint8Array, iv: Uint8Array, data: Uint8Array) {
	if (!key || key.length === 0) throw new Error('Key is empty');
	if (!iv || data.length === 0) throw new Error('Data is empty');
	if (!data || iv.length === 0) throw new Error('IV is empty');

	const algorithm = { name: 'AES-GCM', iv };
	const keyObj = await crypto.subtle.importKey('raw', key, algorithm, false, ['decrypt']);

	const decryptedData = await crypto.subtle.decrypt(algorithm, keyObj, toArrayBuffer(data));
	return decryptedData;
}

export async function derivePasswordKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt,
			iterations: 100_000,
			hash: 'SHA-256'
		},
		keyMaterial,
		256
	);

	return new Uint8Array(derivedBits);
}

export async function comparePassword(password: string, salt: Uint8Array, hashedPassword: Uint8Array): Promise<boolean> {
	const derivedKey = await derivePasswordKey(password, salt);
	if (derivedKey.length !== hashedPassword.length) return false;

	// Use constant-time comparison
	let result = 0;
	for (let i = 0; i < derivedKey.length; i++) {
		result |= derivedKey[i] ^ hashedPassword[i];
	}

	return result === 0;
}

export async function computeLookupHash(token: string, keyBase64: string): Promise<string> {
	const keyBytes = fromBase64(keyBase64);
	const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
	return toBase64(new Uint8Array(sig));
}
