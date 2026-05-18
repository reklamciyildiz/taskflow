import { NextRequest, NextResponse } from 'next/server';
import { teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser, requireTeamAdminOrOrgAdmin } from '@/lib/server-authz';

// PATCH /api/teams/[id]/members/[memberId]/role - Update member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamAdminOrOrgAdmin(params.id, authed);
    if (access instanceof NextResponse) return access;

    const { role } = await request.json();

    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid role. Must be admin, member, or viewer' },
        { status: 400 }
      );
    }

    // Load the target user to know their current org-level role
    const targetUser: any = await userDb.getById(params.memberId);
    if (!targetUser) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Guard: if downgrading an admin/owner to a non-admin role, ensure at least
    // one other org-level admin remains so the organization is never admin-less.
    const isAdminDowngrade =
      role !== 'admin' && (targetUser.role === 'admin' || targetUser.role === 'owner');
    if (isAdminDowngrade && targetUser.organization_id) {
      const orgUsers: any[] = (await userDb.getByOrganization(targetUser.organization_id)) ?? [];
      const adminCount = orgUsers.filter(
        (u) => u.role === 'admin' || u.role === 'owner'
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

    // Update team-level role in team_members
    const updatedMember = await teamMemberDb.updateRole(params.id, params.memberId, role);
    if (!updatedMember) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member not found in team' },
        { status: 404 }
      );
    }

    // Sync org-level role in users table.
    // 'owner' is immutable — only admin/member/viewer can be synced.
    if (targetUser.role !== 'owner') {
      await userDb.update(params.memberId, { role });
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedMember,
      message: 'Member role updated successfully',
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
