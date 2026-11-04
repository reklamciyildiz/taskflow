import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  actionNotificationLink,
  canonicalNotificationLink,
  notificationTargetFromLink,
} from '../lib/notification-nav-link';

let checks = 0;
const target = actionNotificationLink({
  taskId: 'action-123', projectId: 'process-4',
  checklistItemId: 'check-99', noteId: 'note-42',
});
assert.equal(target, '/board?task=action-123&project=process-4&checklist=check-99&note=note-42');
assert.deepEqual(notificationTargetFromLink(target), {
  taskId: 'action-123', checklistItemId: 'check-99', noteId: 'note-42',
});
assert.deepEqual(notificationTargetFromLink('/board?task=action-123'), {
  taskId: 'action-123', checklistItemId: null, noteId: null,
});
assert.deepEqual(notificationTargetFromLink('/board?task=action-123&note=note-42'), {
  taskId: 'action-123', checklistItemId: null, noteId: 'note-42',
});
checks += 4;

assert.equal(canonicalNotificationLink('/board?task=abc&checklist=def&r=cRem&schedule=123&rule=x'),
  '/board?task=abc&checklist=def');
assert.equal(canonicalNotificationLink('https://www.actiproc.com/board?task=abc&note=hello'),
  '/board?task=abc&note=hello');
assert.equal(canonicalNotificationLink('javascript:alert(1)'), null);
assert.equal(canonicalNotificationLink('https://attacker.example/board?task=abc'), null);
assert.equal(canonicalNotificationLink('//attacker.example/board?task=abc'), null);
assert.equal(notificationTargetFromLink('/settings'), null);
assert.equal(notificationTargetFromLink('/board?note=only'), null);
checks += 7;

const workerSource = readFileSync('public/sw.js', 'utf8');
async function simulateClick(incoming: string | null, existing: boolean) {
  const callbacks: Record<string, (event: any) => void> = {};
  const calls: string[] = [];
  let waitFor: Promise<unknown> = Promise.resolve();
  let announced: { title: string; options: any } | null = null;
  const client = {
    url: 'https://actiproc.com/',
    visibilityState: 'visible',
    async focus() { calls.push('focus'); return this; },
    async navigate(url: string) { calls.push('navigate:' + url); this.url = url; return this; },
  };
  const fakeSelf = {
    location: new URL('https://actiproc.com/sw.js'),
    addEventListener: (name: string, callback: (event: any) => void) => { callbacks[name] = callback; },
    clients: {
      async matchAll() { return existing ? [client] : []; },
      async openWindow(url: string) { calls.push('open:' + url); return client; },
    },
    registration: {
      async showNotification(title: string, options: any) {
        announced = { title, options };
      },
    },
  };
  runInNewContext(workerSource, { self: fakeSelf, URL, Promise, console });
  callbacks.push({
    data: { json: () => ({ title: 'Checklist reminder', url: incoming }) },
    waitUntil(promise: Promise<unknown>) { waitFor = promise; },
  });
  await waitFor;
  assert.ok(announced, 'A push event should carry a destination');
  callbacks.notificationclick({
    notification: { data: (announced as any).options.data, close() { calls.push('close'); } },
    waitUntil(promise: Promise<unknown>) { waitFor = promise; },
  });
  await waitFor;
  return calls;
}

async function main() {
const expected = 'https://actiproc.com/board?task=action-123&note=note-42';
const windowCalls = await simulateClick('/board?task=action-123&note=note-42', true);
assert.deepEqual(windowCalls, ['close', 'navigate:' + expected, 'focus']);
const newWindowCalls = await simulateClick('/board?task=action-123&note=note-42', false);
assert.deepEqual(newWindowCalls, ['close', 'open:' + expected]);
const fallbackCalls = await simulateClick(null, true);
assert.ok(fallbackCalls.includes('navigate:https://actiproc.com/notifications'));
const rejectedCalls = await simulateClick('https://evil.example/board?task=steal', true);
assert.ok(rejectedCalls.includes('navigate:https://actiproc.com/notifications'));
checks += 4;

const taskContext = readFileSync('components/TaskContext.tsx', 'utf8');
const actionPanel = readFileSync('components/ActionPanel.tsx', 'utf8');
const notes = readFileSync('components/action/ActionNotes.tsx', 'utf8');
const android = readFileSync('mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
const native = readFileSync('mobile/src/App.tsx', 'utf8');
const adapter = readFileSync('mobile/src/PlannerRuntimeAdapter.tsx', 'utf8');

assert.match(taskContext, /taskApi\.getById\(requestedId\)/,
  'A target missing from the current team should be resolved through an authorized API');
assert.match(taskContext, /setCurrentTeamState\(targetTeam\)/);
assert.match(taskContext, /openTaskEditor\(task\.id, checklistQueryParam, noteQueryParam\)/);
assert.match(taskContext, /notifications\?target=unavailable/);
assert.match(actionPanel, /consumeNoteFocusForTask\(taskId\)/);
assert.match(actionPanel, /focusedNoteId=\{focusedNoteId\}/);
assert.match(notes, /setSelectedId\(focusedNoteId\)/);
assert.match(taskContext, /actiproc:action-target/);
assert.match(android, /android:host="www\.actiproc\.com" android:pathPrefix="\/board"/);
assert.match(native, /notificationTargetFromLink\(url\)/);
assert.match(adapter, /consumeNoteFocusForTask/);
checks += 11;
console.log(JSON.stringify({ checks, pushNavigation: true, noteChecklistTargets: true, androidAppLinkContract: true }));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
