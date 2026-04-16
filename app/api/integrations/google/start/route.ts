import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { getGoogleOAuthClient, GOOGLE_CALENDAR_SCOPES } from '@/lib/google-calendar';
import { GCAL_OAUTH_STATE_COOKIE } from '@/lib/gcal-oauth-cookie';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

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
