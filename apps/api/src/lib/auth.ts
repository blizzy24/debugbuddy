import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabase } from './supabase';

export const KEY_SCHEME = 'db_live_';
export const KEY_PREFIX_LENGTH = 12;
const KEY_PATTERN = /^db_live_[0-9a-f]{32}$/;

export interface GeneratedKey {
  key: string;
  hash: string;
  prefix: string;
}

export interface VerifiedKey {
  keyId: string;
  projectId: string;
  allowedOrigins: string[];
}

interface KeyRow {
  id: string;
  project_id: string;
  key_hash: string;
  revoked_at: string | null;
  projects: { allowed_origins: string[] | null } | null;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** db_live_ + 32 random hex chars. The dashboard does the same thing in the browser. */
export function generateApiKey(): GeneratedKey {
  const key = KEY_SCHEME + randomBytes(16).toString('hex');
  return { key, hash: hashKey(key), prefix: key.slice(0, KEY_PREFIX_LENGTH) };
}

/**
 * Look up candidates by prefix, then compare hashes in constant time.
 * Returns null for unknown, malformed, or revoked keys.
 */
export async function verifyApiKey(raw: string | undefined): Promise<VerifiedKey | null> {
  if (!raw || !KEY_PATTERN.test(raw)) return null;

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, project_id, key_hash, revoked_at, projects(allowed_origins)')
    .eq('key_prefix', raw.slice(0, KEY_PREFIX_LENGTH));

  if (error) throw error;

  const candidate = Buffer.from(hashKey(raw), 'hex');
  const match = ((data ?? []) as unknown as KeyRow[]).find((row) => {
    const stored = Buffer.from(row.key_hash, 'hex');
    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
  });

  if (!match || match.revoked_at) return null;

  const { error: touchError } = await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', match.id);
  if (touchError) console.warn('[auth] failed to update last_used_at:', touchError.message);

  return {
    keyId: match.id,
    projectId: match.project_id,
    allowedOrigins: match.projects?.allowed_origins ?? [],
  };
}
