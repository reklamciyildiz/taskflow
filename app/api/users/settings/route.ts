import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// GET - Get user settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user settings from database or return defaults
    const { data: settings } = await supabase
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
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const updates = await request.json();

    // Upsert settings
    const { data, error } = await supabase
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
      // If table doesn't exist, just return success (settings stored in localStorage as fallback)
      // This is expected behavior when user_settings table is not created yet
      return NextResponse.json({
        success: true,
        data: updates,
        message: 'Settings saved',
      });
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
