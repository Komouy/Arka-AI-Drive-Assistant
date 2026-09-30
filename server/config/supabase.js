import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let supabaseInstance = null;

export const BUCKET_NAME = 'arka-files';

/**
 * Checks whether Supabase environment variables are provided.
 */
export function isSupabaseConfigured() {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_ANON_KEY');
  return Boolean(url && key);
}

/**
 * Get the Supabase client instance (singleton).
 * Prefers SUPABASE_SERVICE_ROLE_KEY for full backend access, falls back to SUPABASE_ANON_KEY.
 */
export function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;

  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_ANON_KEY');

  if (!url || !key) {
    return null;
  }

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseInstance;
}

export const supabase = getSupabaseClient();
