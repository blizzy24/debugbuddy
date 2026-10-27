import { createClient } from '@supabase/supabase-js';
import { config, isConfigured } from './config';

/**
 * Anon-key client acting as the signed-in user. Every query runs under RLS,
 * so the dashboard needs no backend of its own.
 */
export const supabase = createClient(
  isConfigured ? config.supabaseUrl : 'http://localhost:54321',
  isConfigured ? config.supabaseAnonKey : 'missing-anon-key',
);
