import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { projectDb, teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';

// PATCH /api/projects/[id] — update existing project (name, team, column_config)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json().catch(() => null);

    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const existing = await projectDb.getById(params.id);
    if (!existing) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const rawName = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const rawTeamId =
      body && 'teamId' in body
        ? typeof body.teamId === 'string'
          ? body.teamId
          : null
        : undefined;
    const columnConfig = body?.columnConfig;
    const visibility =
      body?.visibility === 'team' || body?.visibility === 'restricted' || body?.visibility === 'private'
        ? body.visibility
        : undefined;

    // Optional: shallow authorization by organization
    const user: any = await userDb.getByEmail(session.user.email);
    if (user?.organization_id && existing.organization_id !== user.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Only org admins or (if project is team-scoped) team admins can update a project.
    const isOrgAdmin = user?.role === 'admin' || user?.role === 'owner';
    if (!isOrgAdmin) {
      const teamId = existing.team_id ?? null;
      if (!teamId) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      const mem = await teamMemberDb.getMembership(teamId, user.id);
      if (mem?.role !== 'admin') {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    const updated = await projectDb.update(params.id, {
      name: rawName,
      team_id: rawTeamId,
      column_config: Array.isArray(columnConfig) ? columnConfig : undefined,
      visibility,
    });

    return NextResponse.json<ApiResponse<unknown>>({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] — delete a project
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const existing = await projectDb.getById(params.id);
    if (!existing) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (user?.organization_id && existing.organization_id !== user.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const isOrgAdmin = user?.role === 'admin' || user?.role === 'owner';
    if (!isOrgAdmin) {
      const teamId = existing.team_id ?? null;
      if (!teamId) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      const mem = await teamMemberDb.getMembership(teamId, user.id);
      if (mem?.role !== 'admin') {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    await projectDb.delete(params.id);

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null,
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


