import { NextRequest } from 'next/server';
import { authenticateMobileRequest, mobileErrorResponse, mobileJson, mobileOptions } from '@/lib/mobile-auth/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function POST(request: NextRequest) {
  try {
    const authed = await authenticateMobileRequest(request);
    const { error } = await supabaseAdmin.rpc('revoke_mobile_auth_session', { p_access_token_hash: authed.accessTokenHash });
    if (error) throw error;
    return mobileJson(request, { success: true });
  } catch (error) { return mobileErrorResponse(request, error); }
}
