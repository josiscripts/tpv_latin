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

// LAB PROTECTION: Fail fast if connecting to production from LAB environment
const isProductionUrl = supabaseUrl && supabaseUrl.includes('.supabase.co');
const isLocalUrl = supabaseUrl === 'http://127.0.0.1:54321' || supabaseUrl === 'http://localhost:54321';

if (isProductionUrl && !isLocalUrl) {
  throw new Error(
    `[SECURITY] Cannot connect to production Supabase from LAB environment.\n` +
    `VITE_SUPABASE_URL must be http://127.0.0.1:54321 (LOCAL) or http://localhost:54321.\n` +
    `Current URL: ${supabaseUrl}\n` +
    `This is a safety mechanism to prevent accidental changes to production data.`
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
