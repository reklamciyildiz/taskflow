import { NextRequest, NextResponse } from 'next/server';
import { createUserWithOrganization, joinOrganizationViaInvitation, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import bcrypt from 'bcryptjs';

// POST /api/auth/register - Register a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { email, name, organizationName, invitationToken, password } = body;

    if (!email || !name) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Email and name are required' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await userDb.getByEmail(email);
    if (existingUser) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    let result;

    if (invitationToken) {
      // Join existing organization via invitation
      result = await joinOrganizationViaInvitation(email, name, invitationToken);
    } else {
      // Create user without an organization; onboarding will create/join a workspace.
      // NOTE: the DB schema allows `organization_id` to be null in practice (onboarding depends on it).
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(String(name))}&background=random`;
      const user = await userDb.create({
        email,
        name,
        organization_id: null,
        role: 'member',
        avatar_url: avatarUrl,
      });
      result = { user };
    }

    // Persist password hash for credentials sign-in.
    if (result?.user?.id) {
      const hash = await bcrypt.hash(password, 10);
      await userDb.update(result.user.id, { password_hash: hash });

      // Keep Supabase Auth in sync (RLS compatibility).
      const { syncUserToSupabaseAuth } = await import('@/lib/supabase-auth');
      await syncUserToSupabaseAuth(result.user.id, email, name);
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: result,
      message: 'Registration successful',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error registering user:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
