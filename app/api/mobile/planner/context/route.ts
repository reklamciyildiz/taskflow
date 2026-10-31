import { NextRequest } from 'next/server';
import { projectDb, taskDb, teamDb } from '@/lib/db';
import { hydrateTasksWithCanonicalSchedules } from '@/lib/scheduling-runtime-server';
import { readInboxBoard } from '@/lib/inbox-board-server';
import {
  authenticateMobileRequest,
  mobileErrorResponse,
  mobileJson,
  mobileOptions,
  MobileAuthError,
} from '@/lib/mobile-auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

export async function GET(request: NextRequest) {
  try {
    const { user } = await authenticateMobileRequest(request);
    if (!user.organization_id) throw new MobileAuthError('FORBIDDEN', 403, 'Organization required.');
    const orgAdmin = user.role === 'owner' || user.role === 'admin';
    const accessibleTeams = orgAdmin
      ? await teamDb.getByOrganization(String(user.organization_id))
      : await teamDb.getByUser(String(user.id));
    const teams = accessibleTeams.filter(
      (candidate: any) => String(candidate.organization_id) === String(user.organization_id),
    );
    const requestedTeamId = new URL(request.url).searchParams.get('teamId');
    if (!requestedTeamId) {
      return mobileJson(request, {
        success: true,
        data: { teams, team: null, projects: [], tasks: [], user },
      });
    }
    const team = teams.find((candidate: any) => String(candidate.id) === requestedTeamId) ?? null;
    if (!team) throw new MobileAuthError('FORBIDDEN', 403, 'Workspace access denied.');

    const visibleProjects = await projectDb.getVisibleForUser({
      organizationId: String(user.organization_id),
      teamId: String(team.id),
      userId: String(user.id),
    });
    const visibleProjectIds = new Set(visibleProjects.map((project: any) => String(project.id)));
    const rawTasks = await taskDb.getByTeam(String(team.id));
    const visibleTasks = rawTasks.filter((task: any) => !task.project_id || visibleProjectIds.has(String(task.project_id)));
    const tasks = await hydrateTasksWithCanonicalSchedules(visibleTasks);
    const inboxBoard = await readInboxBoard(String(team.id));

    return mobileJson(request, {
      success: true,
      data: { teams, team, projects: visibleProjects, tasks, user, inboxBoard },
    });
  } catch (error) {
    return mobileErrorResponse(request, error);
  }
}
