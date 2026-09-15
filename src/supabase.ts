import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://sapjruzzolqfaigwsglj.supabase.co';
const fallbackSupabaseAnonKey = 'sb_publishable_8Cxx0eIjXOvU7KRxig6anQ_XL4vKXXs';

function readEnvValue(value: string | undefined, fallback: string, key: string) {
  const trimmedValue = value?.trim();
  const normalizedValue = trimmedValue?.startsWith(`${key}=`)
    ? trimmedValue.slice(key.length + 1).trim()
    : trimmedValue;

  return normalizedValue || fallback;
}

const supabaseUrl = readEnvValue(import.meta.env.VITE_SUPABASE_URL as string | undefined, fallbackSupabaseUrl, 'VITE_SUPABASE_URL');
const supabaseAnonKey = readEnvValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  fallbackSupabaseAnonKey,
  'VITE_SUPABASE_ANON_KEY'
);

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
