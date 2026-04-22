import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { invitationDb, userDb, organizationDb } from '@/lib/db';
import { randomBytes } from 'crypto';
import { sendInvitationEmail } from '@/lib/email';
import { canInviteMembers, getOrganizationEntitlements } from '@/lib/entitlements';
import { getOrganizationSeatUsage } from '@/lib/entitlements';

// GET - List all invitations for the organization
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

    // Only admins and owners can view invitations
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Permission denied' },
        { status: 403 }
      );
    }

    const invitations = await invitationDb.getByOrganization(user.organization_id);

    return NextResponse.json({
      success: true,
      data: invitations,
    });
  } catch (error: any) {
    console.error('Get invitations error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new invitation
export async function POST(request: NextRequest) {
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

    // Only admins and owners can create invitations
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Permission denied' },
        { status: 403 }
      );
    }

    // Paywall (Team): invitations are only available on active Team subscriptions.
    if (user.organization_id) {
      const ent = await getOrganizationEntitlements(user.organization_id);
      if (!canInviteMembers(ent)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Inviting members is available on the Team plan.',
            code: 'PAYWALL_TEAM_INVITES',
            plan: ent.plan,
          },
          { status: 402 }
        );
      }

      // Seat enforcement: do not allow inviting beyond the purchased seat limit.
      // (Seat usage counts distinct users across org teams; invites are blocked once full.)
      if (Number.isFinite(ent.seatLimit) && ent.seatLimit !== Number.POSITIVE_INFINITY) {
        const used = await getOrganizationSeatUsage(user.organization_id);
        if (used >= ent.seatLimit) {
          return NextResponse.json(
            {
              success: false,
              error: `Your Team plan has reached its seat limit (${ent.seatLimit}). Upgrade to add more seats.`,
              code: 'PAYWALL_TEAM_SEATS',
              seatLimit: ent.seatLimit,
              seatsUsed: used,
            },
            { status: 402 }
          );
        }
      }
    }

    const { email, teamId, role = 'member' } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user already exists in the organization
    const existingUser = await userDb.getByEmail(email);
    if (existingUser && existingUser.organization_id === user.organization_id) {
      return NextResponse.json(
        { success: false, error: 'User is already a member of this organization' },
        { status: 400 }
      );
    }

    // Generate unique invite token (8 characters, uppercase)
    const token = randomBytes(4).toString('hex').toUpperCase();

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await invitationDb.create({
      email: email.toLowerCase().trim(),
      organization_id: user.organization_id,
      team_id: teamId || null,
      role: role,
      invited_by: user.id,
      token: token,
      expires_at: expiresAt.toISOString(),
    });

    // Get organization name for the email
    const organization = await organizationDb.getById(user.organization_id);
    const organizationName = organization?.name || 'Axiom Organization';
    const inviterName = user.name || session.user.name || 'A team member';

    // Send invitation email (don't block on failure)
    const emailResult = await sendInvitationEmail({
      to: email.toLowerCase().trim(),
      inviterName,
      organizationName,
      role,
      inviteToken: token,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...invitation,
        inviteLink: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/invite/${token}`,
        emailSent: emailResult.success,
      },
      message: emailResult.success 
        ? 'Invitation created and email sent successfully' 
        : 'Invitation created but email could not be sent',
    });
  } catch (error: any) {
    console.error('Create invitation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
