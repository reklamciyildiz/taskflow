import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { invitationDb, userDb, teamMemberDb, teamDb } from '@/lib/db';

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
        { success: false, error: 'Invalid or expired invite code' },
        { status: 404 }
      );
    }

    // Check if user already exists
    const existingUser = await userDb.getByEmail(session.user.email);
    
    if (existingUser) {
      // User already exists - check their organization
      if (existingUser.organization_id === invitation.organization_id) {
        // Already in this organization - just mark invitation as accepted and redirect
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
        // User belongs to a different organization
        return NextResponse.json(
          { success: false, error: 'You are already a member of another organization. Please contact support to transfer.' },
          { status: 400 }
        );
      } else {
        // User exists but has no organization - update their organization
        await userDb.update(existingUser.id, {
          organization_id: invitation.organization_id,
          role: invitation.role || 'member',
        });

        // Add to team
        if (invitation.team_id) {
          await teamMemberDb.add(invitation.team_id, existingUser.id, invitation.role || 'member');
        } else {
          const teams = await teamDb.getByOrganization(invitation.organization_id);
          if (teams && teams.length > 0) {
            await teamMemberDb.add(teams[0].id, existingUser.id, invitation.role || 'member');
          }
        }

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

    // If invitation has a team_id, add user to that team
    if (invitation.team_id) {
      await teamMemberDb.add(
        invitation.team_id,
        newUser.id,
        invitation.role || 'member'
      );
    } else {
      // If no specific team, add to the first/default team in the organization
      const teams = await teamDb.getByOrganization(invitation.organization_id);
      if (teams && teams.length > 0) {
        await teamMemberDb.add(
          teams[0].id,
          newUser.id,
          invitation.role || 'member'
        );
      }
    }

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
