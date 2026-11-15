import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { taskDependencyDbError } from '../lib/task-dependencies';

const read = (file: string) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20261115220000_task_dependencies_foundation.sql');
const route = read('app/api/tasks/[id]/dependencies/route.ts');
const taskRoute = read('app/api/tasks/[id]/route.ts');
const client = read('lib/api.ts');
const scheduleRoute = read('app/api/schedules/route.ts');

for (const code of [
  'P23_BLOCKED_COMPLETION', 'P23_DEPENDENCY_CYCLE', 'P23_DEPENDENCY_RECURRING',
  'P23_DEPENDENCY_TERMINAL_TARGET', 'P23_DEPENDENCY_SCOPE',
  'P23_DEPENDENCY_PROCESS_REQUIRED', 'P23_DEPENDENCY_STAGE_CHANGE',
  'P23_DEPENDENCY_SCOPE_CHANGE', 'P23_DEPENDENCY_LIMIT',
]) {
  const error = taskDependencyDbError({ code: '23514', message: code });
  assert.ok(error, 'Missing mapped database conflict: ' + code);
  assert.ok(error.status >= 400 && error.status < 500);
}
assert.equal(taskDependencyDbError({ code: '23505', message: 'duplicate' }), null);
assert.equal(taskDependencyDbError({ code: '23514', message: 'Stage integrity: unrelated' }), null);
assert.equal(taskDependencyDbError({ code: '42P01', message: 'task_dependencies' }), null);

for (const text of [
  'CREATE TABLE public.task_dependencies',
  'p23_dependency_unique UNIQUE',
  'p23_dependency_not_self CHECK',
  'REFERENCES public.tasks(id) ON DELETE CASCADE',
  'ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.task_dependencies FROM PUBLIC, anon, authenticated',
  'p23_lock_graph',
  'pg_advisory_xact_lock',
  'WITH RECURSIVE reachable',
  'p23_tasks_completion_integrity',
  'p23_work_schedule_integrity',
  'p23_org_delete_cleanup',
  'p23_preflight_blocked_transition',
  'actiproc_is_terminal_task_stage',
  "P23_BLOCKED_COMPLETION",
  'P23_DEPENDENCY_CYCLE',
  'P23_DEPENDENCY_RECURRING',
]) assert.ok(migration.includes(text), 'Missing database safety contract: ' + text);

for (const text of [
  'requireTaskNoteAccess(id, { mutate: true }',
  'requireTaskNoteAccess(peerId, { mutate: true }',
  'requireTaskNoteAccess(params.id, { mutate: false }',
  'projectDb.getVisibleForUser',
  "supabaseAdmin.from('task_dependencies')",
  ".eq('organization_id', orgId).eq('team_id', teamId)",
  'allowedProjects.has',
  "commandSchema = z.object(",
  ".strict().refine(",
  'export async function GET',
  'export async function POST',
  'export async function DELETE',
  "taskDependencyDbError(error)",
]) assert.ok(route.includes(text), 'Missing ACL/API contract: ' + text);
assert.ok(route.includes('if (!accessible) continue;'), 'Private Action details must be redacted');
assert.ok(route.includes('if (error?.code === \'23505\')'), 'Link creation must be idempotent');
assert.ok(!route.includes('created_by: request'), 'Actor identity must be session-derived');

const earlyCheck = taskRoute.indexOf("'p23_preflight_blocked_transition'");
const scheduleWrite = taskRoute.indexOf('syncOneOffScheduleCommand(', earlyCheck);
assert.ok(earlyCheck > 0 && scheduleWrite > earlyCheck,
  'Blocked completion must be preflighted before non-transactional schedule side effects');
assert.ok(taskRoute.includes("code: 'DEPENDENCY_BLOCKED'"), 'Blocked transition must return 409');
assert.ok(taskRoute.includes("code: 'DEPENDENCY_CHECK_UNAVAILABLE'"), 'Missing migration must fail closed');
assert.ok(taskRoute.includes('taskDependencyDbError(error)'), 'PATCH must map DB conflict, not return generic 500');
assert.ok(taskRoute.includes('status: dependencyError.status'), 'Blocked completion must return 409');
assert.ok(scheduleRoute.includes('taskDependencyDbError(error)'), 'Recurring schedule conflict needs a meaningful HTTP code');
assert.ok(client.includes('export const taskDependencyApi'), 'Typed client required for P2.3.2');
assert.ok(client.includes("method: 'POST'") && client.includes("method: 'DELETE'"));

console.log(JSON.stringify({ suite: 'task-dependencies-foundation', passed: true, databaseCalls: false }));
