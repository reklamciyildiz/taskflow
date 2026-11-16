/** P2.3.1 Finish-to-Start Action dependencies. User data is never translated. */
export interface TaskDependencyReference {
  id: string;
  taskId: string;
  title: string;
  status: string;
  projectId: string | null;
  isTerminal: boolean;
  createdAt: string;
}
export interface TaskDependencyOverview {
  taskId: string;
  blocked: boolean;
  blockedBy: TaskDependencyReference[];
  blocking: TaskDependencyReference[];
}
export type TaskDependencyCommand =
  | { blockerTaskId: string; blockedTaskId?: never }
  | { blockedTaskId: string; blockerTaskId?: never };

type DependencyError = { code: string; status: number; message: string };
const DOMAIN_ERRORS: Record<string, DependencyError> = {
  P23_BLOCKED_COMPLETION: { code: 'DEPENDENCY_BLOCKED', status: 409, message: 'Finish the blocking Actions before completing this Action.' },
  P23_DEPENDENCY_CYCLE: { code: 'DEPENDENCY_CYCLE', status: 409, message: 'This link would create a circular dependency.' },
  P23_DEPENDENCY_INBOX_UNSYNCED: { code: 'DEPENDENCY_INBOX_UNSYNCED', status: 409, message: 'Synchronize this team Inbox board before linking General Actions.' },
  P23_DEPENDENCY_PROCESS_REQUIRED: { code: 'DEPENDENCY_PROCESS_REQUIRED', status: 409, message: 'Remove dependencies from this Process before deleting it.' },
  P23_DEPENDENCY_INBOX_REQUIRED: { code: 'DEPENDENCY_INBOX_REQUIRED', status: 409, message: 'Remove existing General Action links before deleting the team Inbox stages.' },
  P23_DEPENDENCY_STAGE_CHANGE: { code: 'DEPENDENCY_STAGE_CHANGE', status: 409, message: 'Unlink affected Actions before changing their stage completion semantics.' },
  P23_DEPENDENCY_RECURRING: { code: 'DEPENDENCY_RECURRING', status: 409, message: 'Recurring Actions cannot be connected until occurrence-level dependencies are supported.' },
  P23_DEPENDENCY_TERMINAL_TARGET: { code: 'DEPENDENCY_TERMINAL_TARGET', status: 409, message: 'Reopen the completed Action before adding an unfinished prerequisite.' },
  P23_DEPENDENCY_SCOPE: { code: 'DEPENDENCY_SCOPE', status: 409, message: 'Both Actions must exist in the same team.' },
  P23_DEPENDENCY_SELF: { code: 'DEPENDENCY_SELF', status: 400, message: 'An Action cannot depend on itself.' },
  P23_DEPENDENCY_LIMIT: { code: 'DEPENDENCY_LIMIT', status: 422, message: 'This Action has reached the maximum of 200 direct dependencies.' },
  P23_DEPENDENCY_SCOPE_CHANGE: { code: 'DEPENDENCY_SCOPE_CHANGE', status: 409, message: 'Unlink these Actions before moving them to a different team.' },
  P23_DEPENDENCY_IMMUTABLE: { code: 'DEPENDENCY_IMMUTABLE', status: 400, message: 'Remove and recreate an Action dependency to change it.' },
};
export function taskDependencyDbError(error: unknown): DependencyError | null {
  const db = error as { code?: unknown; message?: unknown } | null;
  if (!db || db.code !== '23514' || typeof db.message !== 'string') return null;
  return DOMAIN_ERRORS[db.message] ?? null;
}
