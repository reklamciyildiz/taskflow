import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof body.selectedCalendarId === 'string' && body.selectedCalendarId.trim()) {
    updates.selected_calendar_id = body.selectedCalendarId.trim();
  }
  if (typeof body.syncEnabled === 'boolean') {
    updates.sync_enabled = body.syncEnabled;
  }

  const { error } = await supabaseAdmin.from('google_calendar_connections').update(updates).eq('user_id', user.id);
  if (error) {
    console.error('Failed to update google calendar connection:', error);
    return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
