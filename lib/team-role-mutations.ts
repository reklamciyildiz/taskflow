import { NextRequest, NextResponse } from 'next/server';
import { teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser, requireTeamAdminOrOrgAdmin } from '@/lib/server-authz';

/** Mutates team membership only. Never writes users.role (organization authority). */
export async function updateTeamMemberRole(
  request: NextRequest, teamId: string, memberId: string,
): Promise<NextResponse<ApiResponse<any>>> {
  const authed = await requireAuthedUser(request);
  if (authed instanceof NextResponse) return authed;
  const access = await requireTeamAdminOrOrgAdmin(teamId, authed);
  if (access instanceof NextResponse) return access;
  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (!['admin', 'member', 'viewer'].includes(role)) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Invalid team role' }, { status: 400 });
  }
  const target = await userDb.getById(memberId);
  if (!target || target.organization_id !== access.team.organization_id) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Member not found in organization' }, { status: 404 });
  }
  const current = await teamMemberDb.getMembership(teamId, memberId);
  if (!current) return NextResponse.json<ApiResponse<null>>(
    { success: false, error: 'Member not found in team' }, { status: 404 });
  if (current.role === 'admin' && role !== 'admin') {
    const members = await teamMemberDb.getByTeam(teamId);
    if ((members ?? []).filter((m: any) => m.role === 'admin').length <= 1) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Cannot downgrade the last team admin' }, { status: 409 });
    }
  }
  if (current.role === role) return NextResponse.json<ApiResponse<any>>(
    { success: true, data: current, message: 'Member role unchanged' });
  const updated = await teamMemberDb.updateRole(teamId, memberId, role);
  return NextResponse.json<ApiResponse<any>>(
    { success: true, data: updated, message: 'Team member role updated successfully' });
}
