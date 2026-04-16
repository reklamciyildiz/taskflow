import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptString } from '@/lib/crypto-app';
import { listCalendars } from '@/lib/google-calendar';

function calendarListFailureMessage(e: unknown): { code?: string; message: string; status: number } {
  const err = e as any;
  const first = err?.errors?.[0] ?? err?.response?.data?.error?.errors?.[0];
  const reason = first?.reason as string | undefined;
  const apiMessage = first?.message as string | undefined;

  if (reason === 'accessNotConfigured' || (apiMessage && apiMessage.includes('Google Calendar API'))) {
    return {
      code: 'calendar_api_disabled',
      message:
        'Google Calendar API is off for this Google Cloud project. In Google Cloud Console open APIs & Services → Library, search "Google Calendar API", click Enable, wait a minute, then use Refresh calendars.',
      status: 403,
    };
  }

  return {
    message: apiMessage || err?.message || 'Failed to list calendars',
    status: 500,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('refresh_token_enc, revoked_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data || (data as any).revoked_at) {
    return NextResponse.json({ success: false, error: 'Not connected' }, { status: 400 });
  }

  try {
    const refresh = decryptString((data as any).refresh_token_enc as string);
    const calendars = await listCalendars(refresh);
    return NextResponse.json({ success: true, data: { calendars } });
  } catch (e: any) {
    console.error('Failed to list calendars:', e);
    const { code, message, status } = calendarListFailureMessage(e);
    return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
  }
}
