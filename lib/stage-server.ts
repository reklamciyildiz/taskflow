import { supabaseAdmin } from './supabase-admin';
import { assertStageAssignment, assertStagesRetained, StageValidationError, validateStageConfig } from './stage-lifecycle';

/** Called before persistence; database triggers provide the concurrent-write guard. */
export async function validateTaskStage(input: {
  projectId: string | null;
  organizationId: string;
  teamId: string;
  status?: unknown;
}): Promise<string> {
  // General columns are still local, per-team settings in A1. Do not invent a server schema.
  if (!input.projectId) {
    if (input.status !== undefined && (typeof input.status !== 'string' || !input.status.trim())) {
      throw new StageValidationError('Stage ID must be a non-empty string.');
    }
    return typeof input.status === 'string' ? input.status : 'todo';
  }
  const { data: project, error } = await supabaseAdmin.from('projects')
    .select('organization_id,team_id,column_config').eq('id', input.projectId).single();
  if (error || !project || project.organization_id !== input.organizationId
    || (project.team_id && project.team_id !== input.teamId)) {
    throw new StageValidationError('Process does not belong to this Action scope.');
  }
  const columns = validateStageConfig(project.column_config);
  const status = input.status === undefined ? columns[0].id : input.status;
  assertStageAssignment(status, columns);
  return status;
}

export async function validateProcessStageUpdate(projectId: string, columns: unknown) {
  const next = validateStageConfig(columns);
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from('tasks').select('id,status')
      .eq('project_id', projectId).order('id').range(offset, offset + 499);
    if (error) throw error;
    assertStagesRetained(next, (data ?? []).map((task) => String(task.status)));
    if ((data ?? []).length < 500) break;
  }
  // This early UX check is not the integrity boundary: the DB trigger checks every row atomically.
  return next;
}

export function stageErrorMessage(error: unknown): string | null {
  if (error instanceof StageValidationError) return error.message;
  const dbError = error as { code?: string; message?: string };
  return dbError?.code === '23514' && dbError.message?.startsWith('Stage integrity:')
    ? dbError.message : null;
}
