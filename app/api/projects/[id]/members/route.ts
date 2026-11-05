import { NextRequest, NextResponse } from 'next/server';
import { projectDb, projectMemberDb, teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser } from '@/lib/server-authz';

function isTeamAdmin(m: any): boolean {
  return m?.role === 'admin';
}

// GET /api/projects/[id]/members - list explicit project members
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user: any = authed.user;
    if (!user) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User not found' }, { status: 404 });
    }

    const project: any = await projectDb.getById(params.id);
    if (!project) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Project not found' }, { status: 404 });
    }

    if (project.organization_id !== user.organization_id) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const isOrgAdmin = user.role === 'admin' || user.role === 'owner';
    if (!isOrgAdmin) {
      // Membership management is an admin function (team admin for team-scoped projects).
      const teamId = project.team_id ?? null;
      if (!teamId) {
        return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      const mem = await teamMemberDb.getMembership(teamId, user.id);
      if (!isTeamAdmin(mem)) {
        return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const rows = await projectMemberDb.list(project.id);
    return NextResponse.json<ApiResponse<any>>({ success: true, data: rows });
  } catch (e) {
    console.error('Error listing project members:', e);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/projects/[id]/members - replace membership list (team admin only)
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user: any = authed.user;
    if (!user) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User not found' }, { status: 404 });
    }

    const project: any = await projectDb.getById(params.id);
    if (!project) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Project not found' }, { status: 404 });
    }

    if (project.organization_id !== user.organization_id) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const isOrgAdmin = user.role === 'admin' || user.role === 'owner';
    if (!isOrgAdmin) {
      if (!project.team_id) {
        return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      const mem = await teamMemberDb.getMembership(project.team_id, user.id);
      if (!isTeamAdmin(mem)) {
        return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.userIds) || body.userIds.length > 200 ||
        body.userIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid project member list' }, { status: 400 });
    }
    const userIds: string[] = [...new Set(body.userIds as string[])];
    const orgUsers = await userDb.getByOrganization(project.organization_id);
    const allowedIds = new Set((orgUsers ?? []).map((entry: any) => entry.id));
    if (userIds.some((id) => !allowedIds.has(id))) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Project members must belong to the organization' },
        { status: 403 });
    }
    await projectMemberDb.replaceMembers(project.id, userIds);
    const rows = await projectMemberDb.list(project.id);
    return NextResponse.json<ApiResponse<any>>({ success: true, data: rows });
  } catch (e) {
    console.error('Error replacing project members:', e);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

