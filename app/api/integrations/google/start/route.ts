import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getGoogleOAuthClient, GOOGLE_CALENDAR_SCOPES } from '@/lib/google-calendar';
import { GCAL_OAUTH_STATE_COOKIE } from '@/lib/gcal-oauth-cookie';
import { requireGoogleCalendarAccess } from '@/lib/google-calendar-access-server';

export async function GET() {
  const access = await requireGoogleCalendarAccess();
  if (access instanceof NextResponse) return access;

  const state = crypto.randomBytes(24).toString('hex');

  const oauth2 = getGoogleOAuthClient();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
  });

  // Attach Set-Cookie to the same redirect response. Using `cookies().set()` before
  // `NextResponse.redirect()` can omit the cookie on the outgoing response in some setups,
  // which breaks OAuth `state` verification (invalid_state).
  const res = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(GCAL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 10,
  });
  return res;
}
