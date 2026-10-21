import { NextRequest } from 'next/server';
import { noteDb, projectDb, taskDb, teamDb, teamMemberDb } from '@/lib/db';
import { extractTextFromNode } from '@/lib/tiptap-parser';
import { serializeNote } from '@/lib/note-server';
import {
  authenticateMobileRequest,
  MobileAuthError,
  mobileErrorResponse,
  mobileJson,
  mobileOptions,
} from '@/lib/mobile-auth/server';
import type { MobileKnowledgeEntry } from '@/shared/mobile-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

export async function GET(request: NextRequest) {
  try {
    const { user } = await authenticateMobileRequest(request);
    const organizationId = user.organization_id ? String(user.organization_id) : '';
    if (!organizationId) throw new MobileAuthError('FORBIDDEN', 403, 'Organization required.');
    const rawLimit = Number(new URL(request.url).searchParams.get('limit') ?? 30);
    const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 30;
    const orgAdmin = user.role === 'admin' || user.role === 'owner';
    const teams = orgAdmin
      ? await teamDb.getByOrganization(organizationId)
      : (await teamMemberDb.getByUser(String(user.id))).map((membership: any) => membership.team).filter(Boolean);

    const batches = await Promise.all(teams.map(async (team: any) => {
      const teamId = String(team.id);
      const projects = await projectDb.getVisibleForUser({ organizationId, teamId, userId: String(user.id) });
      const projectById = new Map(projects.map((project: any) => [String(project.id), project]));
      const tasks = (await taskDb.listKnowledgeScope(teamId)).filter((task: any) => {
        const projectId = task.project_id ? String(task.project_id) : null;
        return String(task.organization_id) === organizationId && (!projectId || projectById.has(projectId));
      });
      const taskById = new Map(tasks.map((task: any) => [String(task.id), task]));
      const notes = await noteDb.getByTeamScope({ organizationId, teamId, taskIds: [...taskById.keys()], limit });
      return notes.map((row: any): MobileKnowledgeEntry => {
        const note = serializeNote(row);
        const task: any = taskById.get(note.taskId);
        const projectId = task?.project_id ? String(task.project_id) : null;
        return {
          id: note.id,
          actionId: note.taskId,
          actionTitle: String(task?.title ?? 'Action'),
          processId: projectId,
          processName: projectId ? String((projectById.get(projectId) as any)?.name ?? 'Process') : null,
          title: note.title,
          type: note.type,
          excerpt: extractTextFromNode(note.content).replace(/\s+/g, ' ').trim().slice(0, 280),
          updatedAt: String(note.updatedAt),
          authorName: note.authorName,
        };
      });
    }));
    const data = batches.flat().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit);
    return mobileJson(request, { success: true, data });
  } catch (error) { return mobileErrorResponse(request, error); }
}
