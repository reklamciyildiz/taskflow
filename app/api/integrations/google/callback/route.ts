import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { getGoogleOAuthClient } from '@/lib/google-calendar';
import { encryptString } from '@/lib/crypto-app';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/settings?google=unauthorized', request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = cookies();
  const expected = cookieStore.get('gcal_oauth_state')?.value;
  cookieStore.set('gcal_oauth_state', '', { path: '/', maxAge: 0 });

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL('/settings?google=invalid_state', request.url));
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return NextResponse.redirect(new URL('/settings?google=no_user', request.url));
  }

  try {
    const oauth2 = getGoogleOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/settings?google=no_refresh_token', request.url));
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
      return NextResponse.redirect(new URL('/settings?google=db_error', request.url));
    }

    return NextResponse.redirect(new URL('/settings?google=connected', request.url));
  } catch (e) {
    console.error('Google OAuth callback failed:', e);
    return NextResponse.redirect(new URL('/settings?google=oauth_error', request.url));
  }
}
