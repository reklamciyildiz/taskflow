import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { getGoogleOAuthClient, GOOGLE_CALENDAR_SCOPES } from '@/lib/google-calendar';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const state = crypto.randomBytes(24).toString('hex');
  const cookieStore = cookies();
  cookieStore.set('gcal_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  const oauth2 = getGoogleOAuthClient();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
  });

  return NextResponse.redirect(url);
}
