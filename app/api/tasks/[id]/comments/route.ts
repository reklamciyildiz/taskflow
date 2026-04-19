import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { commentDb, userDb, taskDb, teamMemberDb, projectDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { canMutateTeamTasks, isOrgAdmin, viewerCannotMutateTasksResponse } from '@/lib/server-authz';

// POST /api/tasks/[id]/comments - Add a comment to a task
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    if (!body.text) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Comment text is required' },
        { status: 400 }
      );
    }

    // Get user from session
    let userId = body.authorId;
    if (session?.user?.email) {
      const user: any = await userDb.getByEmail(session.user.email);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User authentication required' },
        { status: 401 }
      );
    }

    const task = await taskDb.getById(params.id);
    if (!task) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    const author: any = session?.user?.email ? await userDb.getByEmail(session.user.email) : null;
    if (!author || author.id !== userId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (author.organization_id !== (task as any).organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const orgAdmin = isOrgAdmin(author);
    const membership = await teamMemberDb.getMembership((task as any).team_id, author.id);
    if (!membership && !orgAdmin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (!canMutateTeamTasks(membership, orgAdmin)) {
      return viewerCannotMutateTasksResponse();
    }

    const projectId = (task as any).project_id ?? null;
    if (projectId) {
      const visibleProjects = await projectDb.getVisibleForUser({
        organizationId: author.organization_id,
        teamId: (task as any).team_id,
        userId: author.id,
      });
      if (!visibleProjects.some((p: any) => p.id === projectId)) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Task not found' },
          { status: 404 }
        );
      }
    }

    const comment = await commentDb.create(params.id, userId, body.text);

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: comment,
      message: 'Comment added successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
