import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const nav = read('components/shell/CapacitorBottomNavigation.tsx');
const shell = read('components/shell/AppShellLayout.tsx');
const mobileApp = read('mobile/src/App.tsx');
const css = read('mobile/src/mobile.css');
const nativeAuth = read('mobile/android/app/src/main/java/com/actiproc/app/dev/ActiprocAuthPlugin.java');
const config = read('mobile/capacitor.config.ts');
const pkg = JSON.parse(read('mobile/package.json'));

assert.match(nav, /isNativePlatform\?\.\(\) === true/, 'Web/TWA must not display native nav');
assert.match(nav, /platform === 'android'/);
assert.match(nav, /platform === 'ios'/);
assert.match(nav, /max-width: 1023px/);
assert.match(shell, /showNativeTabs \? <CapacitorBottomNavigation \/>/);
assert.match(shell, /safe-area-inset-bottom/);
for (const route of ['/', '/planner', '/board', '/dashboard/knowledge-hub', '/ai']) {
  assert.ok(nav.includes("href: '" + route + "'"), 'Missing navigation destination: ' + route);
}
assert.match(mobileApp, /<CheckSquare2 \/><span>Actions<\/span>/);
assert.match(mobileApp, /aria-label="Account settings"/);
assert.match(css, /\.screen-workspace, \.screen-process/);
assert.match(nativeAuth, /!secureEqual\(expectedState, returnedState\)/, 'Native handler must ignore JS-owned OAuth callback state');
assert.match(nativeAuth, /bridge\.executeOnMainThread\(\(\) -> \{/);
assert.match(config, /\.\.\.\(diagnosticServerUrl \? \{ url: diagnosticServerUrl, cleartext: false \} : \{\}\)/);
assert.ok(pkg.scripts['android:sync:production-beta'].includes('build:android-production-beta'));
assert.ok(!pkg.scripts['android:sync:production-beta'].includes('CAPACITOR_WEB_DIAGNOSTIC_URL'));

// Inbox is the shared home for project_id=NULL Actions, not a fake Process.
const processSwitcher = read('components/ProcessSwitcher.tsx');
const taskBoard = read('components/TaskBoard.tsx');
const webTaskContext = read('components/TaskContext.tsx');
const mobileRuntime = read('mobile/src/PlannerRuntimeAdapter.tsx');
const contextRoute = read('app/api/mobile/planner/context/route.ts');
const inboxApi = read('app/api/inbox/board/route.ts');
const inboxMigration = read('supabase/migrations/20261031180000_team_inbox_board_canonical.sql');

assert.match(processSwitcher, /Inbox/);
assert.match(processSwitcher, /onValueChange\(''\)/);
assert.match(taskBoard, /projectId \? \{ type: 'project', projectId \} : \{ type: 'general' \}/);
assert.match(webTaskContext, /syncInboxStages/);
assert.match(webTaskContext, /inboxBoardStatus === 'ready'/);
assert.match(webTaskContext, /window\.localStorage\.setItem\(`taskflow:generalBoardColumns:/);
assert.match(webTaskContext, /inboxBoardStatus === 'loading'/);
assert.match(taskBoard, /inboxBoardStatus === 'unconfigured'/);
assert.doesNotMatch(taskBoard, /inboxBoardStatus !== 'ready'/);
assert.match(read('middleware.ts'), /pathname === '\/api\/inbox\/board'/);
assert.doesNotMatch(webTaskContext, /avoid defaulting into the legacy/);
assert.match(webTaskContext, /read Inbox|\/api\/inbox\/board/);
assert.match(mobileRuntime, /inboxBoardStatus/);
assert.match(contextRoute, /readInboxBoard/);
assert.match(inboxApi, /requireTeamScopeAccess/);
assert.match(inboxApi, /requireTeamAdminOrOrgAdmin/);
assert.match(inboxApi, /expectedVersion/);
assert.match(inboxMigration, /REFERENCES public\.teams\(id\)/);
assert.match(inboxMigration, /a1_valid_stage_config/);
assert.match(inboxMigration, /guard_canonical_inbox_task_stage/);
assert.match(inboxMigration, /t\.project_id IS NULL/);
assert.match(inboxMigration, /REVOKE ALL ON public\.team_inbox_boards/);
const quickCapture = read('components/QuickCapture.tsx');
const dashboardCapture = read('components/dashboard/DashboardCapture.tsx');
for (const capture of [quickCapture, dashboardCapture]) {
  assert.match(capture, /projectId: null/, 'Inbox capture must remain unassigned');
  assert.match(capture, /generalBoardColumns/, 'Inbox capture must use the canonical first actionable stage');
  assert.doesNotMatch(capture, /ensureInboxProjectId/, 'Capture must not create an artificial Inbox Process');
}

assert.match(taskBoard, /const unresolvedTasks = useMemo\(/);
assert.match(taskBoard, /unresolvedTasks\.length > 0/);
assert.match(taskBoard, /boardScope\.type === 'general'/);
assert.match(taskBoard, /boardScope\.type === 'project'/);
const inboxStageRecovery = read('components/InboxStageRecoveryDialog.tsx');
assert.match(taskBoard, /InboxStageRecoveryDialog/);
assert.match(taskBoard, /setInboxRecoveryOpen\(true\)/);
assert.doesNotMatch(taskBoard, /unresolvedTasks.length === 0 &&/);
assert.match(inboxStageRecovery, /task.projectId == null/);
assert.match(inboxStageRecovery, /teamActions.map\(task => task.status\)/);
assert.match(inboxStageRecovery, /assertStagesRetained\(approved/);
assert.match(inboxStageRecovery, /syncInboxStages\(approved\)/);
assert.match(inboxStageRecovery, /id,\s*title: recovered\[id\]/);
assert.match(inboxStageRecovery, /checked=\{acknowledged\}/);
assert.match(webTaskContext, /syncInboxStages = useCallback\(async \(approvedStages\?: ProjectColumnConfig\[\]\)/);
assert.match(webTaskContext, /assertStagesRetained\(nextStages, savedStatuses\)/);

assert.match(taskBoard, /canEditTask\(task\.createdBy, task\.assigneeId\)/);
assert.match(taskBoard, /stage\.isTerminal && !canCompleteTask\(task\.assigneeId\)/);
assert.match(taskBoard, /applyTaskUpdates\(\[\{ id: taskId, changes: \{ status: stageId \} \}\]\)/);

// The bundled client authenticates its own Notes and Files requests.
const mobileMoreView = read('mobile/src/MobileMoreView.tsx');
const mobileListView = read('mobile/src/MobileListView.tsx');
const noteServer = read('lib/note-server.ts');
const attachmentServer = read('lib/attachment-server.ts');
const taskNotesRoute = read('app/api/tasks/[id]/notes/route.ts');
const noteRoute = read('app/api/notes/[id]/route.ts');
const attachmentListRoute = read('app/api/attachments/route.ts');
const attachmentItemRoute = read('app/api/attachments/[id]/route.ts');
const middleware = read('middleware.ts');

assert.ok(middleware.includes("pathname === '/api/attachments'"));
assert.ok(middleware.includes('notes$'), 'Mobile notes CORS guard missing');
assert.ok(middleware.includes('attachments'), 'Mobile attachments CORS guard missing');
assert.match(noteServer, /requireAuthedUser\(request\)/);
assert.match(taskNotesRoute, /requireTaskNoteAccess\(params.id, \{ mutate: false \}, undefined, request\)/);
assert.match(taskNotesRoute, /requireTaskNoteAccess\(params.id, \{ mutate: true \}, undefined, request\)/);
assert.match(noteRoute, /requireNoteAccess\(params.id, \{ mutate: true \}, request\)/);
assert.match(attachmentServer, /requireTaskNoteAccess\(target.taskId, \{ mutate \}, undefined, request\)/);
assert.match(attachmentServer, /allowed.includes\(origin\)/);
const privateFileLookup = attachmentServer.slice(attachmentServer.indexOf('export async function attachmentAccess('));
assert.ok(privateFileLookup.indexOf('await requireAuthedUser(request)') >= 0);
assert.ok(privateFileLookup.indexOf('await requireAuthedUser(request)') < privateFileLookup.indexOf('.from("attachments")'),
  'Private attachment existence must not be queried before authentication');
assert.match(attachmentListRoute, /attachmentTargetAccess\(target, false, request\)/);
assert.match(attachmentItemRoute, /attachmentAccess\(params.id, false, request\)/);
assert.match(mobileApp, /<MobileMoreView/);
assert.match(mobileApp, /<MobileListView/);
assert.match(mobileApp, /aria-label="All features"/);
assert.match(mobileMoreView, /Customers/);
assert.match(mobileMoreView, /Settings/);
assert.match(mobileMoreView, /sign in separately/);
assert.match(mobileListView, /openTaskEditor\(task.id\)/);
assert.match(mobileListView, /task.teamId === currentTeam.id/);

console.log('Capacitor navigation, local bundle, bearer ACL and OAuth guards passed.');
