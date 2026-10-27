import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Service-role client. Bypasses RLS by design: the API is the trusted writer
 * for widget traffic and authorises every request itself via API keys.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
