import { NextRequest, NextResponse } from 'next/server';
import { teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser, requireTeamAdminOrOrgAdmin } from '@/lib/server-authz';
import { syncLemonSubscriptionQuantityToOrgHeadcount } from '@/lib/lemon-sync-seats';

// PATCH /api/teams/[id]/members/[memberId] - Update a team member
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamAdminOrOrgAdmin(params.id, authed);
    if (access instanceof NextResponse) return access;

    const body = await request.json();

    if (!body.role) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Role is required' },
        { status: 400 }
      );
    }
    if (!['admin', 'member', 'viewer'].includes(body.role)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid role. Must be admin, member, or viewer' },
        { status: 400 }
      );
    }

    // Load target user for guard check and org-level sync
    const targetUser: any = await userDb.getById(params.memberId);
    if (!targetUser) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Guard: cannot downgrade the last org admin
    const isAdminDowngrade =
      body.role !== 'admin' && (targetUser.role === 'admin' || targetUser.role === 'owner');
    if (isAdminDowngrade && targetUser.organization_id) {
      const orgUsers: any[] = (await userDb.getByOrganization(targetUser.organization_id)) ?? [];
      const adminCount = orgUsers.filter(
        (u: any) => u.role === 'admin' || u.role === 'owner'
      ).length;
      if (adminCount <= 1) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: 'Cannot downgrade the last organization admin. Promote another member first.',
          },
          { status: 400 }
        );
      }
    }

    // Update team-level role and sync org-level role
    const member = await teamMemberDb.updateRole(params.id, params.memberId, body.role);
    if (targetUser.role !== 'owner') {
      await userDb.update(params.memberId, { role: body.role });
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: member,
      message: 'Member updated successfully',
    });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/[id]/members/[memberId] - Remove a member from a team
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamAdminOrOrgAdmin(params.id, authed);
    if (access instanceof NextResponse) return access;

    // Get user info to check if they have other teams in this organization
    const user = await userDb.getById(params.memberId);
    if (!user) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const organizationIdLeft = user.organization_id ? String(user.organization_id) : '';

    // Remove from team
    // Guard: do not allow removing the last team admin.
    const members = await teamMemberDb.getByTeam(params.id);
    const adminCount = (members ?? []).filter((m: any) => m?.role === 'admin').length;
    const removingIsAdmin = (members ?? []).some((m: any) => m?.user_id === params.memberId && m?.role === 'admin');
    if (removingIsAdmin && adminCount <= 1) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Cannot remove the last team admin' },
        { status: 400 }
      );
    }
    await teamMemberDb.remove(params.id, params.memberId);

    // Check if user has any other teams in this organization
    const teamMembers = await teamMemberDb.getByUser(params.memberId);
    const userTeams = teamMembers.filter((tm: any) => {
      // Check if team belongs to the same organization
      return tm.team && tm.team.organization_id === user.organization_id && tm.team_id !== params.id;
    });

    // If user has no other teams, remove from organization
    if (userTeams.length === 0 && organizationIdLeft) {
      await userDb.update(params.memberId, {
        organization_id: null, // Properly remove from organization
        role: 'member', // Reset role to member
      });
      await syncLemonSubscriptionQuantityToOrgHeadcount(organizationIdLeft);
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
