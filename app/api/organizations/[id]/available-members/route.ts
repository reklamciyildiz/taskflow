import { NextRequest, NextResponse } from 'next/server';
import { userDb, teamMemberDb, teamDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { isOrgAdmin, requireAuthedUser } from '@/lib/server-authz';

// This endpoint previously exposed unrestricted user rows (including private DB
// fields). Require a same-organization principal and return a strict projection.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const actor = authed.user;
    if (!actor.organization_id || actor.organization_id !== params.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const excludeTeamId = searchParams.get('excludeTeamId');
    const orgAdmin = isOrgAdmin(actor);

    if (excludeTeamId) {
      const team = await teamDb.getById(excludeTeamId);
      if (!team || team.organization_id !== params.id) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' }, { status: 403 });
      }
      if (!orgAdmin) {
        const membership = await teamMemberDb.getMembership(excludeTeamId, actor.id);
        if (membership?.role !== 'admin') {
          return NextResponse.json<ApiResponse<null>>(
            { success: false, error: 'Forbidden' }, { status: 403 });
        }
      }
    } else if (!orgAdmin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Only admins may list available organization members' },
        { status: 403 });
    }

    const users: any[] = await userDb.getByOrganization(params.id);
    const safeUsers = users.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      is_online: user.is_online,
      role: user.role,
    }));
    if (!excludeTeamId) {
      return NextResponse.json<ApiResponse<any>>({ success: true, data: safeUsers });
    }
    const teamMembers = await teamMemberDb.getByTeam(excludeTeamId);
    const memberIds = new Set(teamMembers.map((member: any) => member.user_id));
    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: safeUsers.filter((user: any) => !memberIds.has(user.id)),
    });
  } catch (error) {
    console.error('Error fetching available members:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' }, { status: 500 });
  }
}
