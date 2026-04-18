import { NextRequest, NextResponse } from 'next/server';
import { teamMemberDb } from '@/lib/db';
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

    // Update the member's role
    const updatedMember = await teamMemberDb.updateRole(params.id, params.memberId, role);

    if (!updatedMember) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
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
