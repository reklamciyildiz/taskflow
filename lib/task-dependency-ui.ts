/** Read-only presentation metadata. No inaccessible Action IDs leave the API. */
export type DependencyStatusFilter = 'all' | 'blocked' | 'ready' | 'blocking';

export interface TaskDependencyFlags {
  blocked: boolean;
  /** Has one or more prerequisites and every prerequisite is complete. */
  ready: boolean;
  /** Has at least one downstream Action. */
  blocking: boolean;
  hasPredecessors: boolean;
}
export type TeamDependencySummary = Record<string, TaskDependencyFlags>;

export const TASK_DEPENDENCIES_CHANGED_EVENT = 'actiproc:task-dependencies-changed';

export function notifyTaskDependenciesChanged(teamId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TASK_DEPENDENCIES_CHANGED_EVENT, { detail: { teamId } }));
}

/** Filtering is deliberately conservative: no response means no claim of readiness. */
export function matchesDependencyFilter(
  flag: TaskDependencyFlags | undefined,
  filter: DependencyStatusFilter,
): boolean {
  if (filter === 'all') return true;
  if (!flag) return false;
  if (filter === 'blocked') return flag.blocked;
  if (filter === 'ready') return flag.ready;
  return flag.blocking;
}
