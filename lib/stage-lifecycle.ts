import type { ProjectColumnConfig } from './types';

export class StageValidationError extends Error {}

/** Identity is allocated once, never derived from presentation or position. */
export function newStageId(): string {
  return crypto.randomUUID();
}

export function validateStageConfig(raw: unknown): ProjectColumnConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new StageValidationError('Add at least one stage. Empty or malformed stage configuration must be repaired explicitly.');
  }
  const ids = new Set<string>();
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim()
      || typeof entry.title !== 'string' || !entry.title.trim()
      || (entry.color !== undefined && typeof entry.color !== 'string')
      || (entry.isTerminal !== undefined && typeof entry.isTerminal !== 'boolean')) {
      throw new StageValidationError('Every stage needs a non-empty ID and title and valid metadata.');
    }
    if (ids.has(entry.id)) throw new StageValidationError(`Duplicate stage ID: ${entry.id}`);
    ids.add(entry.id);
    return { ...entry, title: entry.title.trim() };
  });
}

export function assertStageAssignment(status: unknown, columns: unknown): asserts status is string {
  const configured = validateStageConfig(columns);
  if (typeof status !== 'string' || !configured.some((column) => column.id === status)) {
    throw new StageValidationError('Stage does not belong to the selected process. Choose an existing stage.');
  }
}

/** Missing references remain unresolved; neither labels nor `done` imply terminal. */
export function resolveStageLifecycle(status: string, columns: readonly ProjectColumnConfig[]) {
  const matches = columns.filter((column) => column.id === status);
  const stage = matches.length === 1 ? matches[0] : null;
  return {
    stageId: status,
    stage,
    resolved: stage !== null,
    isTerminal: stage?.isTerminal === true,
    isActionable: stage !== null && stage.isTerminal !== true,
    // Closure and business success are separate concepts. A1 has no outcome data.
    outcome: null as 'successful' | 'unsuccessful' | null,
  };
}

export function resolveActionLifecycle(
  task: { projectId?: string | null; status: string },
  projects: readonly { id: string; columnConfig: ProjectColumnConfig[] }[],
  generalColumns: readonly ProjectColumnConfig[],
) {
  const project = task.projectId ? projects.find((entry) => entry.id === task.projectId) ?? null : null;
  const columns = task.projectId ? project?.columnConfig ?? [] : generalColumns;
  return { projectId: task.projectId ?? null, ...resolveStageLifecycle(task.status, columns) };
}

export function assertStagesRetained(columns: unknown, referencedStatuses: readonly string[]) {
  const next = validateStageConfig(columns);
  const ids = new Set(next.map((column) => column.id));
  const missing = [...new Set(referencedStatuses.filter((status) => !ids.has(status)))];
  if (missing.length) {
    throw new StageValidationError(`Cannot remove stages referenced by Actions: ${missing.join(', ')}. Move these Actions explicitly first.`);
  }
  return next;
}
