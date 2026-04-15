import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  await supabaseAdmin.from('google_calendar_event_links').delete().eq('user_id', user.id);
  await supabaseAdmin.from('google_calendar_connections').delete().eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
