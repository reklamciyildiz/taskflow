import { NextRequest, NextResponse } from 'next/server';
import { invitationDb, organizationDb } from '@/lib/db';

// GET - Get invitation details by token
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const raw = params.token;

    if (!raw || typeof raw !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Token is required', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const normalized = raw.trim().toUpperCase();
    const row = await invitationDb.getRawByToken(normalized);

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid invitation link.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    if (row.accepted_at) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This invitation has already been used. Sign in to access the workspace.',
          code: 'ALREADY_USED',
        },
        { status: 410 }
      );
    }

    if (new Date(row.expires_at) <= new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'This invitation has expired. Ask your admin for a new invite.',
          code: 'EXPIRED',
        },
        { status: 410 }
      );
    }

    const invitation = row;

    // Get organization details
    let organization = null;
    try {
      organization = await organizationDb.getById(invitation.organization_id);
    } catch (e) {
      // Organization might not be accessible
    }

    return NextResponse.json({
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        organization_id: invitation.organization_id,
        team_id: invitation.team_id,
        role: invitation.role,
        expires_at: invitation.expires_at,
        organization: organization ? { name: organization.name } : null,
      },
    });
  } catch (error: any) {
    console.error('Get invitation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel/revoke an invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const raw = params.token;
    if (!raw || typeof raw !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const invitation = await invitationDb.getRawByToken(raw.trim().toUpperCase());

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      );
    }

    await invitationDb.delete(invitation.id);

    return NextResponse.json({
      success: true,
      message: 'Invitation cancelled',
    });
  } catch (error: any) {
    console.error('Delete invitation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
