import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trCatalog } from '../lib/i18n/catalog';
import { matchesDependencyFilter, type TaskDependencyFlags } from '../lib/task-dependency-ui';

const file = (path: string) => readFileSync(path, 'utf8');
const panel = file('components/ActionPanel.tsx');
const manager = file('components/action/ActionDependencies.tsx');
const status = file('components/action/DependencyStatusBadge.tsx');
const hook = file('hooks/useTeamDependencySummary.ts');
const board = file('components/TaskBoard.tsx');
const card = file('components/TaskCard.tsx');
const property = file('components/PropertyBoard.tsx');
const list = file('components/TaskList.tsx');
const api = file('app/api/tasks/dependency-summary/route.ts');
const workflow = file('.github/workflows/p23-dependencies-foundation.yml');

const blocked: TaskDependencyFlags = {
  blocked: true, ready: false, blocking: false, hasPredecessors: true,
};
const ready: TaskDependencyFlags = {
  blocked: false, ready: true, blocking: false, hasPredecessors: true,
};
const blocking: TaskDependencyFlags = {
  blocked: false, ready: false, blocking: true, hasPredecessors: false,
};
const none: TaskDependencyFlags = {
  blocked: false, ready: false, blocking: false, hasPredecessors: false,
};

for (const [filter, expected] of [
  ['all', [true, true, true, true]],
  ['blocked', [true, false, false, false]],
  ['ready', [false, true, false, false]],
  ['blocking', [false, false, true, false]],
] as const) {
  assert.deepEqual([blocked, ready, blocking, none].map(flag => matchesDependencyFilter(flag, filter)), expected);
}
assert.equal(matchesDependencyFilter(undefined, 'ready'), false, 'Never assume ready without API data');
assert.equal(matchesDependencyFilter(undefined, 'blocked'), false);

for (const text of [
  '<ActionDependencies', 'flushAll();', 'openTaskEditor(id);',
  "toast.error(t('Could not change Action stage. Check its dependencies.'))",
]) assert.ok(panel.includes(text), 'Missing Action Panel integration: ' + text);

for (const text of [
  "taskDependencyApi.get(taskId)",
  "taskDependencyApi.link(taskId, command)",
  "taskDependencyApi.unlink(taskId, command)",
  'notifyTaskDependenciesChanged(teamId)',
  'candidate.teamId === teamId',
  'candidate.id !== taskId',
  "candidate.schedule?.scheduleType !== 'recurring'",
  'canEditTask(candidate.createdBy, candidate.assigneeId)',
  'DialogContent className=',
  'onOpen={onNavigate}',
  'aria-busy={loading}',
  'aria-label={t(',
]) assert.ok(manager.includes(text), 'Missing manager behavior: ' + text);
assert.ok(manager.includes("overview?.blocked") && manager.includes('hiddenBlocker'),
  'Restricted unfinished blockers must be presented without exposing IDs');

for (const text of [
  'useTeamDependencySummary(currentTeam?.id, tasks)',
  "activeDependencyFilter !== 'all'",
  'matchesDependencyFilter(',
  'dependencySummary.items[task.id]',
  "t('Filter by dependency status')",
  "dependencySummary.error",
]) {
  assert.ok(board.includes(text), 'Missing Board dependency integration: ' + text);
  assert.ok(list.includes(text) || text.includes('activeDependencyFilter'), 'Missing List dependency integration: ' + text);
}
assert.ok(card.includes('<DependencyStatusBadge'));
assert.ok(property.includes('dependency={dependencySummary[task.id]}'));
assert.ok(list.includes('blocked={dependencySummary.items[task.id]?.blocked}'),
  'List checkbox must communicate blocked completion');
assert.ok(list.includes("Boolean(dependencySummary.items[task.id]?.blocked && !terminal)"),
  'List stage select must guard terminal options');
for (const tag of ['data-dependency-blocked', 'data-dependency-ready', 'data-dependency-blocking']) {
  assert.ok(status.includes(tag), 'Missing accessible status: ' + tag);
}
assert.ok(hook.includes("window.addEventListener('focus'"));
assert.ok(hook.includes('TASK_DEPENDENCIES_CHANGED_EVENT'));
assert.ok(hook.includes("cache: 'no-store'"));
assert.ok(api.includes('requireTeamScopeAccess('));
assert.ok(api.includes('projectDb.getVisibleForUser'));
assert.ok(api.includes('visibleProjectIds.has'));
assert.ok(api.includes('canSee(blocked)') && api.includes('canSee(blocker)'));
assert.ok(api.includes("if (edges.length >= MAX_EDGES) return fail"));
assert.ok(api.includes("if (!isTerminal(blocker)) flag.blocked = true"));

const keys = [
  'Dependencies', 'Show Action dependencies', 'Loading dependencies…',
  'No prerequisites yet', 'Waiting for', 'Blocks', 'Add prerequisite Action',
  'Add dependent Action', 'Search team Actions…', 'Dependency connected',
  'Dependency removed', 'An Action cannot depend on itself.',
  'Waiting for unfinished prerequisite Actions', 'Ready to proceed',
  'Blocking other Actions', 'Filter by dependency status',
  'All dependencies', 'Dependency filters unavailable. Showing all Actions.',
  'Complete prerequisite Actions before moving this Action to a completed stage.',
  'Complete prerequisites before finishing {title}',
  'Could not change Action stage. Check its dependencies.',
];
for (const key of keys) {
  assert.ok(Object.prototype.hasOwnProperty.call(trCatalog, key), 'Missing Turkish catalog key: ' + key);
  assert.ok(trCatalog[key], 'Empty Turkish translation: ' + key);
}
assert.ok(workflow.includes('test-task-dependencies-ui'), 'P2.3.2 tests must be wired into CI');

console.log(JSON.stringify({ suite: 'P2.3.2 UI and localization', passed: true, catalogKeys: keys.length }));
