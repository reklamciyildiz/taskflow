import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client - Service Role Key ile
 * 
 * Bu client RLS'i bypass eder ve tüm verilere erişebilir.
 * SADECE server-side (API routes) kullanılmalıdır!
 * Asla client-side'da kullanmayın!
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
 * Normal Supabase client (RLS ile)
 * Frontend'den kullanılabilir
 */
export { supabase } from './supabase';
