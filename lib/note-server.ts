import { NextResponse } from 'next/server';
import { noteDb, projectDb, taskDb, teamMemberDb } from '@/lib/db';
import {
  canMutateTeamTasks,
  isOrgAdmin,
  requireAuthedUser,
  type AuthedContext,
  viewerCannotMutateTasksResponse,
} from '@/lib/server-authz';
import type { ApiResponse, NoteType } from '@/lib/types';

export const NOTE_TYPES: readonly NoteType[] = ['note', 'learning', 'idea', 'decision'];
export const EMPTY_NOTE_DOCUMENT = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export function isNoteType(value: unknown): value is NoteType {
  return typeof value === 'string' && NOTE_TYPES.includes(value as NoteType);
}

export function isTipTapDocument(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as { type?: unknown; content?: unknown };
  return document.type === 'doc' && Array.isArray(document.content);
}

export function serializeNote(row: any) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    organizationId: String(row.organization_id),
    teamId: String(row.team_id),
    authorId: String(row.author_id),
    authorName: String(row.author?.name ?? 'Unknown'),
    authorAvatar: row.author?.avatar_url ?? null,
    title: String(row.title ?? ''),
    type: row.type as NoteType,
    content: row.content ?? EMPTY_NOTE_DOCUMENT,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type TaskNoteAccess = {
  user: any;
  task: any;
  membership: any;
  orgAdmin: boolean;
};

export async function requireTaskNoteAccess(
  taskId: string,
  options: { mutate: boolean },
  existingAuth?: AuthedContext,
): Promise<TaskNoteAccess | NextResponse<ApiResponse<null>>> {
  const authed = existingAuth ?? (await requireAuthedUser());
  if (authed instanceof NextResponse) return authed;

  const task = await taskDb.getById(taskId);
  if (!task) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Task not found' },
      { status: 404 },
    );
  }

  const user = authed.user as any;
  if (!user.organization_id || user.organization_id !== (task as any).organization_id) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    );
  }

  const orgAdmin = isOrgAdmin(user);
  const membership = await teamMemberDb.getMembership((task as any).team_id, user.id);
  if (!membership && !orgAdmin) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    );
  }
  if (options.mutate && !canMutateTeamTasks(membership, orgAdmin)) {
    return viewerCannotMutateTasksResponse();
  }

  const projectId = (task as any).project_id ?? null;
  if (projectId) {
    const visibleProjects = await projectDb.getVisibleForUser({
      organizationId: user.organization_id,
      teamId: (task as any).team_id,
      userId: user.id,
    });
    if (!visibleProjects.some((project: any) => project.id === projectId)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 },
      );
    }
  }

  return { user, task, membership, orgAdmin };
}

export async function requireNoteAccess(
  noteId: string,
  options: { mutate: boolean },
) {
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;

  const note = await noteDb.getById(noteId);
  if (!note) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Note not found' },
      { status: 404 },
    );
  }

  const access = await requireTaskNoteAccess(
    String((note as any).task_id),
    options,
    authed,
  );
  if (access instanceof NextResponse) return access;

  if (
    (note as any).organization_id !== (access.task as any).organization_id ||
    (note as any).team_id !== (access.task as any).team_id
  ) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Note not found' },
      { status: 404 },
    );
  }

  return { ...access, note };
}
