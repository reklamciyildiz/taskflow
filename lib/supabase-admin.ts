import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client (Service Role Key).
 *
 * This client bypasses RLS and can access all data.
 * Use ONLY on the server (API routes).
 * Never use on the client.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Alias for supabaseAdmin (used in AI services)
 */
export const db = supabaseAdmin;

/**
 * Normal Supabase client (with RLS).
 * Safe to use from the frontend.
 */
export { supabase } from './supabase';
