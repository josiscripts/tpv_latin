import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is not defined in environment variables');
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not defined in environment variables');
}

// ENVIRONMENT PROTECTION: Validate Supabase connection
const isLocalUrl = supabaseUrl === 'http://127.0.0.1:54321' || supabaseUrl === 'http://localhost:54321';
const isProdUrl = supabaseUrl === 'https://nqqdflyuzfvsctajvxgn.supabase.co';
const isValidUrl = isLocalUrl || isProdUrl;

if (!isValidUrl) {
  throw new Error(
    `[SECURITY] Invalid Supabase URL.\n` +
    `Allowed URLs:\n` +
    `- LOCAL: http://127.0.0.1:54321 (LAB environment)\n` +
    `- PROD: https://nqqdflyuzfvsctajvxgn.supabase.co (lymarket production)\n` +
    `Current URL: ${supabaseUrl}\n` +
    `This is a safety mechanism to prevent accidental misconfiguration.`
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
