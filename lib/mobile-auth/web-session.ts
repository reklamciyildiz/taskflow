import 'server-only';

import { encode } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import {
  assertMobileUserAllowed,
  consumeMobileAuthRateLimit,
  hashPkceVerifier,
  hashSecret,
  mobileAuthEnabled,
  MobileAuthError,
  mobileErrorResponse,
  secureEqual,
} from '@/lib/mobile-auth/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { userDb } from '@/lib/db';
import { getPublicAppUrl } from '@/lib/app-url';

export type MobileWebSessionPlatform = 'android' | 'ios';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function safeCallbackPath(value: FormDataEntryValue | null): string {
  if (
    typeof value !== 'string'
    || value.length > 2048
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /[\r\n]/.test(value)
  ) return '/';
  return value;
}

function requestedPlatform(
  value: FormDataEntryValue | null,
  requiredPlatform?: MobileWebSessionPlatform,
): MobileWebSessionPlatform {
  if (requiredPlatform) {
    if (typeof value === 'string' && value.length > 0 && value !== requiredPlatform) {
      throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 400, 'Authorization platform is invalid.');
    }
    return requiredPlatform;
  }
  if (value === 'android' || value === 'ios') return value;
  throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 400, 'Authorization platform is invalid.');
}

/**
 * Atomically consumes a short-lived mobile OAuth code and installs the normal
 * NextAuth JWT cookie in the requesting WebView's HTTPS cookie store.
 *
 * The native shell submits the code and PKCE verifier in a POST body. Browser
 * cookies, Google tokens and mobile bearer tokens are never copied into the
 * WebView or exposed to JavaScript.
 */
export async function createMobileWebSession(
  request: NextRequest,
  requiredPlatform?: MobileWebSessionPlatform,
): Promise<NextResponse> {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const canonicalOrigin = new URL(getPublicAppUrl()).origin;
    if (request.nextUrl.origin !== canonicalOrigin) {
      throw new MobileAuthError('INVALID_WEB_SESSION_ORIGIN', 403, 'Web session origin is invalid.');
    }
    const form = await request.formData();
    const code = typeof form.get('code') === 'string' ? String(form.get('code')) : '';
    const verifier = typeof form.get('code_verifier') === 'string' ? String(form.get('code_verifier')) : '';
    const callbackPath = safeCallbackPath(form.get('callback_path'));
    const platform = requestedPlatform(form.get('platform'), requiredPlatform);
    if (!/^[A-Za-z0-9_-]{48,128}$/.test(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
      throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 400, 'Authorization code or PKCE verifier is invalid.');
    }

    await consumeMobileAuthRateLimit(request, `${platform}-web-session`, code, 12);
    const codeHash = hashSecret(code);
    const now = new Date().toISOString();
    const { data: pendingCode, error: lookupError } = await supabaseAdmin
      .from('mobile_auth_codes')
      .select('id,user_id,code_challenge,platform')
      .eq('code_hash', codeHash)
      .eq('platform', platform)
      .is('consumed_at', null)
      .gt('expires_at', now)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!pendingCode || !secureEqual(String(pendingCode.code_challenge), hashPkceVerifier(verifier))) {
      throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 401, 'Authorization code is invalid, expired, or already used.');
    }

    // The conditional update is the atomic claim. Concurrent/replayed requests
    // can observe the pending row, but only one can receive claimed.user_id.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('mobile_auth_codes')
      .update({ consumed_at: now })
      .eq('id', pendingCode.id)
      .is('consumed_at', null)
      .select('user_id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed?.user_id) {
      throw new MobileAuthError('AUTHORIZATION_CODE_REPLAYED', 401, 'Authorization code was already used.');
    }

    const user: any = await userDb.getById(String(claimed.user_id));
    if (!user?.id || !user.email) throw new MobileAuthError('UNAUTHORIZED', 401, 'User no longer exists.');
    assertMobileUserAllowed(String(user.id));
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Session signing is not configured.');

    const sessionToken = await encode({
      secret,
      maxAge: SESSION_MAX_AGE_SECONDS,
      token: {
        sub: String(user.id),
        id: String(user.id),
        email: String(user.email),
        name: user.name ? String(user.name) : null,
        picture: user.avatar_url ? String(user.avatar_url) : null,
        provider: 'google',
        organizationId: user.organization_id ?? null,
        role: user.role ?? null,
        needsOnboarding: !user.organization_id,
      },
    });

    const response = NextResponse.redirect(new URL(callbackPath, canonicalOrigin), 303);
    response.cookies.set({
      name: '__Secure-next-auth.session-token',
      value: sessionToken,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  } catch (error) {
    return mobileErrorResponse(request, error);
  }
}
