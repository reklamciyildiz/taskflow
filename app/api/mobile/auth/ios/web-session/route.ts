import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function safeCallbackPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function POST(request: NextRequest) {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const form = await request.formData();
    const code = typeof form.get('code') === 'string' ? String(form.get('code')) : '';
    const verifier = typeof form.get('code_verifier') === 'string' ? String(form.get('code_verifier')) : '';
    const callbackPath = safeCallbackPath(form.get('callback_path'));
    if (!/^[A-Za-z0-9_-]{48,128}$/.test(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
      throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 400, 'Authorization code or PKCE verifier is invalid.');
    }

    await consumeMobileAuthRateLimit(request, 'ios-web-session', code, 12);
    const codeHash = hashSecret(code);
    const now = new Date().toISOString();
    const { data: pendingCode, error: lookupError } = await supabaseAdmin
      .from('mobile_auth_codes')
      .select('id,user_id,code_challenge,platform')
      .eq('code_hash', codeHash)
      .eq('platform', 'ios')
      .is('consumed_at', null)
      .gt('expires_at', now)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!pendingCode || !secureEqual(String(pendingCode.code_challenge), hashPkceVerifier(verifier))) {
      throw new MobileAuthError('INVALID_AUTHORIZATION_CODE', 401, 'Authorization code is invalid, expired, or already used.');
    }

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

    const response = NextResponse.redirect(new URL(callbackPath, request.nextUrl.origin), 303);
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
    return response;
  } catch (error) {
    return mobileErrorResponse(request, error);
  }
}
