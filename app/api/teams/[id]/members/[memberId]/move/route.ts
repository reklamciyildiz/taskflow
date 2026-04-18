import { NextRequest, NextResponse } from 'next/server';
import { teamMemberDb, teamDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser, isOrgAdmin } from '@/lib/server-authz';

// PATCH /api/teams/[id]/members/[memberId]/move - Move member to another team
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;

    const { targetTeamId } = await request.json();

    if (!targetTeamId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Target team ID is required' },
        { status: 400 }
      );
    }

    // Check if target team exists and is in the same organization
    const sourceTeam = await teamDb.getById(params.id);
    const targetTeam = await teamDb.getById(targetTeamId);

    if (!sourceTeam || !targetTeam) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    if (sourceTeam.organization_id !== targetTeam.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Cannot move member between different organizations' },
        { status: 400 }
      );
    }

    // Must belong to the same org as the teams.
    const user = authed.user;
    if (!user.organization_id || user.organization_id !== sourceTeam.organization_id) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Authorization: org admins can move freely within org. Otherwise must be admin in BOTH teams.
    const orgAdmin = isOrgAdmin(user);
    if (!orgAdmin) {
      const srcMembership = await teamMemberDb.getMembership(params.id, user.id);
      const dstMembership = await teamMemberDb.getMembership(targetTeamId, user.id);
      if (srcMembership?.role !== 'admin' || dstMembership?.role !== 'admin') {
        return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // Ensure member exists in source team
    const movingMembership = await teamMemberDb.getMembership(params.id, params.memberId);
    if (!movingMembership) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member is not in the source team' },
        { status: 404 }
      );
    }

    // Check if member is already in target team
    const existingMembership = await teamMemberDb.getMembership(targetTeamId, params.memberId);
    if (existingMembership) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member is already in this team' },
        { status: 400 }
      );
    }

    // Ensure target user belongs to this org (defense-in-depth)
    const targetUser: any = await userDb.getById(params.memberId);
    if (!targetUser) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User not found' }, { status: 404 });
    }
    if (!targetUser.organization_id || targetUser.organization_id !== sourceTeam.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Cannot move user from a different organization' },
        { status: 403 }
      );
    }

    // Add member to target team
    await teamMemberDb.add(targetTeamId, params.memberId, 'member');

    // Remove from source team
    await teamMemberDb.remove(params.id, params.memberId);

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Member moved successfully',
    });
  } catch (error) {
    console.error('Error moving member:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
