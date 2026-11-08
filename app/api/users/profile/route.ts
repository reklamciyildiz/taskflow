import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { userDb } from '@/lib/db';
import { publicUserRow } from '@/lib/public-identity-projection';

// PATCH - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user = await userDb.getById(authed.user.id);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const { name, avatar_url } = await request.json();

    const updates: any = {};
    if (name) updates.name = name;
    if (avatar_url) updates.avatar_url = avatar_url;

    const data = await userDb.update(user.id, updates);

    return NextResponse.json({
      success: true,
      data: publicUserRow(data),
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    console.error('Update profile failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get current user profile
export async function GET(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user = await userDb.getById(authed.user.id);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: publicUserRow(user),
    });
  } catch (error: any) {
    console.error('Get profile failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
