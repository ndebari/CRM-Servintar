import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://sapjruzzolqfaigwsglj.supabase.co';
const fallbackSupabaseAnonKey = 'sb_publishable_8Cxx0eIjXOvU7KRxig6anQ_XL4vKXXs';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? fallbackSupabaseUrl;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? fallbackSupabaseAnonKey;

function isValidHttpUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = isValidHttpUrl(supabaseUrl) && Boolean(supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;
