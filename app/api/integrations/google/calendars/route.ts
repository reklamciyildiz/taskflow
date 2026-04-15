import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptString } from '@/lib/crypto-app';
import { listCalendars } from '@/lib/google-calendar';

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
    return NextResponse.json({ success: false, error: e?.message || 'Failed to list calendars' }, { status: 500 });
  }
}
