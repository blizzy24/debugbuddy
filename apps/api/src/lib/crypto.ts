import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

/**
 * AES-256-GCM for secrets at rest (Jira API tokens).
 *
 * Format: v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 *
 * `context` is bound in as additional authenticated data, so a ciphertext only
 * decrypts for the row it was written for (we pass the project id). Copying
 * one project's encrypted token into another project's row makes it fail.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

if (KEY.length !== 32) {
  // env.ts already enforces 64 hex chars; this guards against that check ever being loosened.
  throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes.');
}

export function encrypt(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

export class DecryptionError extends Error {
  constructor() {
    super('Stored secret could not be decrypted.');
    this.name = 'DecryptionError';
  }
}

export function decrypt(payload: string, context: string): string {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new DecryptionError();
  try {
    const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, tampered data, or wrong context. Never echo the payload.
    throw new DecryptionError();
  }
}
