import { stageErrorMessage } from '@/lib/stage-server';
import { NextRequest, NextResponse } from 'next/server';
import { projectDb, teamMemberDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser } from '@/lib/server-authz';

// PATCH /api/projects/[id] — update existing project (name, team, column_config)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user: any = authed.user;
    const body = await request.json().catch(() => null);

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
      column_config: columnConfig,
      visibility,
    });

    return NextResponse.json<ApiResponse<unknown>>({
      success: true,
      data: updated,
    });
  } catch (error) {
    const stageError = stageErrorMessage(error);
    if (stageError) return NextResponse.json({ success: false, error: stageError }, { status: 400 });
    console.error('Error updating project:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] — delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user: any = authed.user;

    const existing = await projectDb.getById(params.id);
    if (!existing) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

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
    const stageError = stageErrorMessage(error);
    if (stageError) return NextResponse.json({ success: false, error: stageError }, { status: 400 });
    console.error('Error deleting project:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


