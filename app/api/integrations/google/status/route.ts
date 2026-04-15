import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  const { data } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('email, selected_calendar_id, sync_enabled, revoked_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data || (data as any).revoked_at) {
    return NextResponse.json({ success: true, data: { connected: false } });
  }

  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      email: (data as any).email,
      selectedCalendarId: (data as any).selected_calendar_id,
      syncEnabled: (data as any).sync_enabled !== false,
    },
  });
}
