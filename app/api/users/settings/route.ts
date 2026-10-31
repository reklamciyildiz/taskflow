import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET - Get user settings
export async function GET(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user = authed.user;

    // Get user settings from database or return defaults
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const defaultSettings = {
      email_notifications: true,
      // Default OFF to avoid "snap back to enabled" when DB row doesn't exist yet.
      // The browser permission can still be granted, but app-level preference starts OFF.
      push_notifications: false,
      team_activity: false,
      compact_view: false,
      time_zone: null as string | null,
    };

    return NextResponse.json({
      success: true,
      data: settings || defaultSettings,
      meta: { source: settings ? 'db' : 'default' as const },
    });
  } catch (error: any) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update user settings
export async function PATCH(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user = authed.user;

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid settings payload' }, { status: 400 });
    }
    const updates: Record<string, boolean | string | null> = {};
    const allowedBooleanFields = ['email_notifications', 'push_notifications', 'team_activity', 'compact_view'];
    for (const [key, value] of Object.entries(body)) {
      if (allowedBooleanFields.includes(key) && typeof value === 'boolean') updates[key] = value;
      else if (key === 'time_zone' && (value === null || (typeof value === 'string' && value.length <= 100))) {
        if (value !== null) {
          try { new Intl.DateTimeFormat('en-US', { timeZone: value }); }
          catch { return NextResponse.json({ success: false, error: 'Invalid time zone' }, { status: 400 }); }
        }
        updates[key] = value;
      } else return NextResponse.json({ success: false, error: 'Invalid or unsupported setting' }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No settings provided' }, { status: 400 });
    }

    // Upsert settings
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: user.id,
        ...updates,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      // Do not claim cross-device persistence if the shared database write failed.
      console.error('Update user settings failed:', error);
      return NextResponse.json(
        { success: false, error: 'Could not persist settings. Try again.' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Settings updated successfully',
    });
  } catch (error: any) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
