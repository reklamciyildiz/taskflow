import { NextRequest, NextResponse } from 'next/server';
import { joinOrganizationViaInvitation, userDb } from '@/lib/db';
import { InvitationAcceptError } from '@/lib/invitation-acceptance';
import { ApiResponse } from '@/lib/types';
import bcrypt from 'bcryptjs';

// POST /api/auth/register - Register a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, invitationToken, password } = body;
    if (typeof email !== 'string' || typeof name !== 'string' ||
        !email.trim().includes('@') || !name.trim()) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Email and name are required' },
        { status: 400 },
      );
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await userDb.getByEmail(normalizedEmail);
    if (existing) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User with this email already exists' },
        { status: 409 },
      );
    }

    // Hash BEFORE the transactional invitation acceptance, so successful
    // invite registration never leaves a new member without credentials.
    const passwordHash = await bcrypt.hash(password, 10);
    let result;
    if (invitationToken) {
      if (typeof invitationToken !== 'string') {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Invalid invitation token' }, { status: 400 },
        );
      }
      result = await joinOrganizationViaInvitation(
        normalizedEmail, name.trim(), invitationToken, passwordHash,
      );
    } else {
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name.trim())}&background=random`;
      const user = await userDb.create({
        email: normalizedEmail,
        name: name.trim(),
        organization_id: null,
        role: 'member',
        avatar_url: avatarUrl,
        password_hash: passwordHash,
      });
      result = { user };
    }

    // Sync the persisted identity to Supabase Auth for RLS compatibility.
    if (result?.user?.id) {
      const { syncUserToSupabaseAuth } = await import('@/lib/supabase-auth');
      await syncUserToSupabaseAuth(result.user.id, normalizedEmail, name.trim());
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      // Never return the password hash in an API response.
      data: {
        user: result?.user
          ? {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              avatar_url: result.user.avatar_url,
              organization_id: result.user.organization_id,
              role: result.user.role,
            }
          : null,
        ...('invitation' in result ? { invitation: result.invitation } : {}),
      },
      message: 'Registration successful',
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof InvitationAcceptError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error('[register] Registration failed');
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Registration unavailable' }, { status: 503 },
    );
  }
}
