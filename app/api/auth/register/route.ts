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
      // Create new organization (default naming if none provided).
      const orgName =
        typeof organizationName === 'string' && organizationName.trim().length > 0
          ? organizationName.trim()
          : `${String(name).trim() || 'My'} Workspace`;
      result = await createUserWithOrganization(email, name, orgName);
    }

    // Persist password hash for credentials sign-in (safe even if connection is via invite).
    if (result?.user?.id) {
      const hash = await bcrypt.hash(password, 10);
      await userDb.update(result.user.id, { password_hash: hash });
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
