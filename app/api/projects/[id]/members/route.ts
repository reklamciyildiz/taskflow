import { NextRequest, NextResponse } from 'next/server';
import { projectDb, projectMemberDb, teamMemberDb } from '@/lib/db';
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
    const userIds = Array.isArray(body?.userIds) ? body.userIds.filter((x: any) => typeof x === 'string') : [];
    await projectMemberDb.replaceMembers(project.id, userIds);
    const rows = await projectMemberDb.list(project.id);
    return NextResponse.json<ApiResponse<any>>({ success: true, data: rows });
  } catch (e) {
    console.error('Error replacing project members:', e);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

