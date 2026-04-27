import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { invitationDb, userDb, teamMemberDb, teamDb } from '@/lib/db';

function normalizeInviteTeamRole(role: string | null | undefined): 'admin' | 'member' | 'viewer' {
  if (role === 'admin' || role === 'viewer') return role;
  return 'member';
}

function normalizeInviteOrgRole(role: string | null | undefined): 'admin' | 'member' {
  // Org-level roles are owner/admin/member. `viewer` is team-level only.
  if (role === 'admin') return 'admin';
  return 'member';
}

async function ensureUserInInviteTeams(
  userId: string,
  invitation: { organization_id: string; team_id: string | null; role: string | null }
) {
  const tr = normalizeInviteTeamRole(invitation.role ?? undefined);
  if (invitation.team_id) {
    await teamMemberDb.ensureMember(invitation.team_id, userId, tr);
    return;
  }
  const teams = await teamDb.getByOrganization(invitation.organization_id);
  if (teams && teams.length > 0) {
    await teamMemberDb.ensureMember(teams[0].id, userId, tr);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { inviteCode } = await request.json();

    if (!inviteCode || typeof inviteCode !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invite code is required' },
        { status: 400 }
      );
    }

    // Find invitation by token (getByToken already filters expired and accepted invitations)
    const invitation = await invitationDb.getByToken(inviteCode.trim().toUpperCase());

    if (!invitation) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid or expired invite code. Check the link or ask your admin for a new invitation.',
          code: 'INVITE_INVALID',
        },
        { status: 404 }
      );
    }

    // Check if user already exists
    const existingUser = await userDb.getByEmail(session.user.email);
    
    if (existingUser) {
      // User already exists - check their organization
      if (existingUser.organization_id === invitation.organization_id) {
        await ensureUserInInviteTeams(existingUser.id, invitation);
        await invitationDb.accept(invitation.id);
        return NextResponse.json({
          success: true,
          data: {
            user: existingUser,
            organizationId: existingUser.organization_id,
          },
          message: 'You are already a member of this organization',
        });
      } else if (existingUser.organization_id) {
        return NextResponse.json(
          {
            success: false,
            error:
              'You are already a member of another organization. Contact your admin or support before accepting this invite.',
            code: 'OTHER_ORG',
          },
          { status: 400 }
        );
      } else {
        // User exists but has no organization - update their organization
        await userDb.update(existingUser.id, {
          organization_id: invitation.organization_id,
          role: normalizeInviteOrgRole(invitation.role ?? undefined),
        });

        await ensureUserInInviteTeams(existingUser.id, invitation);

        await invitationDb.accept(invitation.id);

        return NextResponse.json({
          success: true,
          data: {
            user: existingUser,
            organizationId: invitation.organization_id,
          },
          message: 'Successfully joined organization',
        });
      }
    }

    // Create new user in the organization
    const newUser = await userDb.create({
      email: session.user.email,
      name: session.user.name || session.user.email.split('@')[0],
      avatar_url: (session.user as any).image || null,
      organization_id: invitation.organization_id,
      role: invitation.role || 'member',
    });

    await ensureUserInInviteTeams(newUser.id, invitation);

    // Mark invitation as accepted
    await invitationDb.accept(invitation.id);

    return NextResponse.json({
      success: true,
      data: {
        user: newUser,
        organizationId: invitation.organization_id,
      },
      message: 'Successfully joined organization',
    });
  } catch (error: any) {
    console.error('Join organization error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
