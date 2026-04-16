import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { getGoogleOAuthClient } from '@/lib/google-calendar';
import { encryptString } from '@/lib/crypto-app';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { google } from 'googleapis';
import { GCAL_OAUTH_STATE_COOKIE } from '@/lib/gcal-oauth-cookie';

function redirectWithClearedState(request: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/settings?${query}`, request.url));
  // Expire immediately (same attributes as start route so the browser removes it).
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(GCAL_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return redirectWithClearedState(request, 'google=unauthorized');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = request.cookies.get(GCAL_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expected || state !== expected) {
    return redirectWithClearedState(request, 'google=invalid_state');
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return redirectWithClearedState(request, 'google=no_user');
  }

  try {
    const oauth2 = getGoogleOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return redirectWithClearedState(request, 'google=no_refresh_token');
    }

    oauth2.setCredentials(tokens);
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const me = await oauth2Api.userinfo.get();
    const googleUserId = me.data.id ?? null;
    const email = me.data.email ?? session.user.email;

    const enc = encryptString(tokens.refresh_token);

    // Default calendar: primary (user can change in Settings)
    const { error } = await supabaseAdmin.from('google_calendar_connections').upsert(
      {
        user_id: user.id,
        google_user_id: googleUserId,
        email,
        refresh_token_enc: enc,
        selected_calendar_id: 'primary',
        sync_enabled: true,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('Failed to persist google calendar connection:', error);
      return redirectWithClearedState(request, 'google=db_error');
    }

    return redirectWithClearedState(request, 'google=connected');
  } catch (e) {
    console.error('Google OAuth callback failed:', e);
    return redirectWithClearedState(request, 'google=oauth_error');
  }
}
