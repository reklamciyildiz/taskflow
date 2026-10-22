import { NextRequest, NextResponse } from 'next/server';
import { decryptEphemeral, mobileAppLinkUrl, mobileGoogleClient } from '@/lib/mobile-auth/google';
import { assertMobileUserAllowed, hashSecret, mobileAuthEnabled, MobileAuthError, randomToken, secureEqual } from '@/lib/mobile-auth/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireVerifiedGoogleIdentity } from '@/lib/mobile-auth/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    if (!state) throw new MobileAuthError('INVALID_OAUTH_CALLBACK', 400, 'OAuth callback is incomplete.');
    const { data: attempt, error } = await supabaseAdmin.from('mobile_auth_oauth_attempts').select('*').eq('state_hash', hashSecret(state)).is('consumed_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!attempt) throw new MobileAuthError('INVALID_OAUTH_STATE', 400, 'OAuth state is invalid or expired.');
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin.from('mobile_auth_oauth_attempts').update({ consumed_at: claimedAt }).eq('state_hash', attempt.state_hash).is('consumed_at', null).select('state_hash').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new MobileAuthError('OAUTH_STATE_REPLAYED', 400, 'OAuth callback was already used.');
    const appLink = mobileAppLinkUrl(String(attempt.redirect_uri));
    const providerError = request.nextUrl.searchParams.get('error');
    if (providerError || !code) {
      appLink.searchParams.set('error', providerError === 'access_denied' ? 'access_denied' : 'oauth_failed');
      appLink.searchParams.set('state', attempt.client_state);
      return NextResponse.redirect(appLink, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    const { clientId, client } = mobileGoogleClient();
    const { tokens } = await client.getToken({ code, codeVerifier: decryptEphemeral(attempt.google_verifier_cipher) });
    if (!tokens.id_token) throw new MobileAuthError('GOOGLE_IDENTITY_MISSING', 401, 'Google did not return an identity token.');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified || !payload.nonce || !secureEqual(hashSecret(payload.nonce), attempt.nonce_hash)) {
      throw new MobileAuthError('GOOGLE_IDENTITY_INVALID', 401, 'Google identity could not be verified.');
    }
    const user: any = await requireVerifiedGoogleIdentity(payload.sub, payload.email);
    assertMobileUserAllowed(String(user.id));
    const authorizationCode = randomToken(48);
    const { error: codeError } = await supabaseAdmin.from('mobile_auth_codes').insert({
      code_hash: hashSecret(authorizationCode), user_id: user.id, code_challenge: attempt.code_challenge,
      redirect_uri: attempt.redirect_uri, platform: attempt.platform, expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
    });
    if (codeError) throw codeError;
    appLink.searchParams.set('code', authorizationCode);
    appLink.searchParams.set('state', attempt.client_state);
    return NextResponse.redirect(appLink, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    const message = error instanceof MobileAuthError ? error.message : 'Google sign-in could not be completed.';
    return new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width"><title>Axiom sign-in</title><p>${escapeHtml(message)}</p>`, { status: error instanceof MobileAuthError ? error.status : 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!)); }
