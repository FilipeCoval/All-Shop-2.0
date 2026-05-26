import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lmpleqndkgsnalwwlzxx.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize client only if we have a key, or wrap in a way that doesn't crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Helper to check if Supabase backup is configured
 */
export const isSupabaseEnabled = () => !!supabase;
