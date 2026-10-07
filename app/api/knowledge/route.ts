import { NextRequest, NextResponse } from 'next/server';
import { noteDb, projectDb, taskDb } from '@/lib/db';
import { serializeNote } from '@/lib/note-server';
import {
  requireAuthedUser,
  requireTeamMemberOrOrgAdmin,
} from '@/lib/server-authz';
import type { ApiResponse, Note } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const teamId = new URL(request.url).searchParams.get('teamId');
    if (!teamId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'teamId is required' },
        { status: 400 },
      );
    }

    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const teamAccess = await requireTeamMemberOrOrgAdmin(teamId, authed);
    if (teamAccess instanceof NextResponse) return teamAccess;

    const organizationId = String(teamAccess.team.organization_id);
    const visibleProjects = await projectDb.getVisibleForUser({
      organizationId,
      teamId,
      userId: String(authed.user.id),
    });
    const visibleProjectIds = new Set(
      visibleProjects.map((project: any) => String(project.id)),
    );
    const visibleTasks = (await taskDb.listKnowledgeScope(teamId)).filter((task: any) => {
      if (String(task.organization_id) !== organizationId) return false;
      const projectId = task.project_id ? String(task.project_id) : null;
      return projectId === null || visibleProjectIds.has(projectId);
    });
    const visibleTaskIds = new Set(visibleTasks.map((task: any) => String(task.id)));

    const scopedNotes = await noteDb.getByTeamScope({ organizationId, teamId });
    const notes = scopedNotes
      .filter((note: any) => visibleTaskIds.has(String(note.task_id)))
      .map(serializeNote);

    return NextResponse.json<ApiResponse<Note[]>>({ success: true, data: notes });
  } catch (error) {
    console.error('Error loading Knowledge Hub sources:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
