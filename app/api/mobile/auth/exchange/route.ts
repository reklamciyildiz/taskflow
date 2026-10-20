import { NextRequest } from 'next/server';
import { hashPkceVerifier, hashSecret, mobileAuthEnabled, MobileAuthError, mobileErrorResponse, mobileJson, mobileOptions, publicMobileUser, randomToken } from '@/lib/mobile-auth/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { userDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function POST(request: NextRequest) {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const body = await request.json().catch(() => null);
    const code = typeof body?.code === 'string' ? body.code : '';
    const verifier = typeof body?.codeVerifier === 'string' ? body.codeVerifier : '';
    const platform = body?.platform === 'ios' ? 'ios' : 'android';
    if (!code || verifier.length < 43) throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 400, 'Authorization code or PKCE verifier is invalid.');
    const accessToken = randomToken();
    const refreshToken = randomToken(48);
    const accessTokenExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('claim_mobile_auth_code', {
      p_code_hash: hashSecret(code), p_code_verifier_challenge: hashPkceVerifier(verifier),
      p_access_token_hash: hashSecret(accessToken), p_refresh_token_hash: hashSecret(refreshToken),
      p_access_expires_at: accessTokenExpiresAt, p_refresh_expires_at: refreshTokenExpiresAt,
      p_device_id_hash: typeof body?.deviceId === 'string' ? hashSecret(body.deviceId) : null, p_platform: platform,
    });
    if (error) throw error;
    const claimed = Array.isArray(data) ? data[0] : data;
    if (!claimed?.user_id) throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 401, 'Authorization code is invalid, expired, or already used.');
    const user = await userDb.getById(String(claimed.user_id));
    return mobileJson(request, { success: true, data: { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, user: publicMobileUser(user) } });
  } catch (error) { return mobileErrorResponse(request, error); }
}
