import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { encryptEphemeral, mobileAppLinkUrl, mobileGoogleClient } from '@/lib/mobile-auth/google';
import { consumeMobileAuthRateLimit, hashSecret, mobileAuthEnabled, MobileAuthError, mobileErrorResponse, randomToken } from '@/lib/mobile-auth/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const codeChallenge = request.nextUrl.searchParams.get('code_challenge') ?? '';
    const clientState = request.nextUrl.searchParams.get('state') ?? '';
    const platform = request.nextUrl.searchParams.get('platform') === 'ios' ? 'ios' : 'android';
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || !/^[A-Za-z0-9_-]{32,128}$/.test(clientState)) {
      throw new MobileAuthError('INVALID_OAUTH_REQUEST', 400, 'OAuth PKCE parameters are invalid.');
    }
    await consumeMobileAuthRateLimit(request, 'google-start', clientState, 12);
    const { client } = mobileGoogleClient();
    const state = randomToken();
    const googleVerifier = randomToken(48);
    const googleChallenge = createGoogleChallenge(googleVerifier);
    const nonce = randomToken();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await supabaseAdmin.from('mobile_auth_oauth_attempts').insert({
      state_hash: hashSecret(state), client_state: clientState, code_challenge: codeChallenge,
      redirect_uri: mobileAppLinkUrl().toString(), platform,
      google_verifier_cipher: encryptEphemeral(googleVerifier), nonce_hash: hashSecret(nonce), expires_at: expiresAt,
    });
    if (error) throw error;
    const url = client.generateAuthUrl({ access_type: 'offline', scope: ['openid', 'email', 'profile'], state, code_challenge: googleChallenge, code_challenge_method: 'S256', prompt: 'select_account', nonce } as any);
    return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return mobileErrorResponse(request, error); }
}

function createGoogleChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
