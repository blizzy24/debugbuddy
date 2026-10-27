const SCHEME = 'db_live_';
const PREFIX_LENGTH = 12;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface NewKey {
  key: string;
  prefix: string;
  hash: string;
}

/**
 * Same scheme as apps/api/src/lib/auth.ts: db_live_ + 32 random hex chars,
 * stored as sha256(full key) plus the first 12 characters. The raw key never
 * leaves this function except to be shown once.
 */
export async function generateApiKey(): Promise<NewKey> {
  const key = SCHEME + toHex(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return { key, prefix: key.slice(0, PREFIX_LENGTH), hash: toHex(new Uint8Array(digest)) };
}
