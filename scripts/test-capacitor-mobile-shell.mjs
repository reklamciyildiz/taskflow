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

// General scope must be an explicit destination, even after a user selects a Process.
const processSwitcher = read('components/ProcessSwitcher.tsx');
const taskBoard = read('components/TaskBoard.tsx');
assert.match(processSwitcher, /General Actions/, 'General board must have a clear name');
assert.match(processSwitcher, /onValueChange\(''\)/, 'General board must be selectable again');
assert.match(taskBoard, /projectId \? \{ type: 'project', projectId \} : \{ type: 'general' \}/);

// Historical stages must never be silently remapped, hidden, or overwritten.
assert.match(taskBoard, /const unresolvedTasks = useMemo\(/);
assert.match(taskBoard, /Needs stage assignment/);
assert.match(taskBoard, /filteredTasks\.filter\(\(task\) => !boardColumns\.some/);
assert.match(taskBoard, /canEditTask\(task\.createdBy, task\.assigneeId\)/);
assert.match(taskBoard, /stage\.isTerminal && !canCompleteTask\(task\.assigneeId\)/);
assert.match(taskBoard, /applyTaskUpdates\(\[\{ id: taskId, changes: \{ status: stageId \} \}\]\)/);
assert.match(taskBoard, /onValueChange=\{\(stageId\) => void assignUnresolvedStage\(task\.id, stageId\)\}/);

console.log('Capacitor navigation, local bundle and OAuth guards passed.');
