import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [workerSource, offlinePage, providers, middleware, androidManifest, androidLauncher, iosController] =
  await Promise.all([
    readFile('public/sw.js', 'utf8'),
    readFile('public/offline.html', 'utf8'),
    readFile('app/providers.tsx', 'utf8'),
    readFile('middleware.ts', 'utf8'),
    readFile('twa-diagnostic/project/app/src/main/AndroidManifest.xml', 'utf8'),
    readFile('twa-diagnostic/project/app/src/main/java/com/actiproc/app/LauncherActivity.java', 'utf8'),
    readFile('ios/AxiomIOS/Axiom/AxiomWebViewController.swift', 'utf8'),
  ]);

assert.match(providers, /ensureServiceWorkerReady\(\)/);
assert.match(middleware, /offline\.html/);
assert.match(offlinePage, /id="retry"/);
assert.match(offlinePage, /manifest\.webmanifest\?connectivity=/);
assert.doesNotMatch(offlinePage, /Offline Workspace|saved offline|sync(?:ed|ing) changes/i);

const listeners = new Map();
const cachedOffline = new Response('axiom offline', { status: 200 });
const added = [];
let shownNotification;
let networkFetch = async () => new Response('online', { status: 200 });
class WorkerRequest {
  constructor(url) {
    this.url = new URL(url, 'https://getaxiomm.vercel.app').href;
  }
}
const sandbox = {
  Request: WorkerRequest,
  Response,
  URL,
  Promise,
  console,
  fetch: (...args) => networkFetch(...args),
  caches: {
    open: async () => ({ add: async (request) => added.push(new URL(request.url, 'https://getaxiomm.vercel.app').pathname) }),
    keys: async () => ['axiom-shell-old', 'unrelated-cache'],
    delete: async () => true,
    match: async (url) => (url === '/offline.html' ? cachedOffline.clone() : undefined),
  },
  self: {
    location: { origin: 'https://getaxiomm.vercel.app' },
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => undefined },
    skipWaiting: () => undefined,
    addEventListener: (name, handler) => listeners.set(name, handler),
    registration: { showNotification: async (...args) => { shownNotification = args; } },
  },
};
vm.runInNewContext(workerSource, sandbox, { filename: 'public/sw.js' });

let installWork;
listeners.get('install')({ waitUntil: (promise) => { installWork = promise; } });
await installWork;
assert.ok(added.includes('/offline.html'));

function dispatchFetch(request) {
  let responsePromise;
  listeners.get('fetch')({ request, respondWith: (promise) => { responsePromise = promise; } });
  return responsePromise;
}

const apiRequest = { method: 'GET', mode: 'cors', url: 'https://getaxiomm.vercel.app/api/tasks' };
assert.equal(dispatchFetch(apiRequest), undefined, 'API requests must never be handled by the shell cache');

const navigation = { method: 'GET', mode: 'navigate', url: 'https://getaxiomm.vercel.app/planner' };
assert.equal(await (await dispatchFetch(navigation)).text(), 'online');

networkFetch = async () => new Response('unauthorized', { status: 401 });
const authResponse = await dispatchFetch(navigation);
assert.equal(authResponse.status, 401, 'Authentication errors must not be presented as connectivity failures');
assert.equal(await authResponse.text(), 'unauthorized');

networkFetch = async () => { throw new TypeError('connection reset'); };
assert.equal(await (await dispatchFetch(navigation)).text(), 'axiom offline');

networkFetch = async () => new Response('gateway', { status: 503 });
assert.equal(await (await dispatchFetch(navigation)).text(), 'axiom offline');

let pushWork;
listeners.get('push')({
  data: { json: () => ({ origin: 'https://getaxiomm.vercel.app', title: 'Reminder', body: 'Due now' }) },
  waitUntil: (promise) => { pushWork = promise; },
});
await pushWork;
assert.equal(shownNotification[0], 'Reminder');
assert.equal(shownNotification[1].body, 'Due now');
assert.ok(listeners.has('notificationclick'), 'Notification click handler must remain registered');

assert.match(androidManifest, /<activity android:name="LauncherActivity"[\s\S]*?android:exported="true"[\s\S]*?<action android:name="android\.intent\.action\.MAIN" \/>[\s\S]*?<category android:name="android\.intent\.category\.LAUNCHER" \/>/);
assert.match(androidManifest, /<activity android:name="LauncherActivity"[\s\S]*?<action android:name="android\.intent\.action\.VIEW"\/>/);
assert.match(androidManifest, /<activity-alias[\s\S]*?android:name="EntryActivity"[\s\S]*?android:targetActivity="LauncherActivity"[\s\S]*?android:enabled="true"[\s\S]*?android:exported="true"[\s\S]*?\/>/);
assert.doesNotMatch(androidManifest.match(/<activity-alias[\s\S]*?\/>/)?.[0] ?? '', /android\.intent\.action\.MAIN|android\.intent\.category\.LAUNCHER|intent-filter/);
assert.doesNotMatch(androidManifest, /<activity android:name="EntryActivity"|android:name="OfflineActivity"/);
assert.match(androidLauncher, /extends com\.google\.androidbrowserhelper\.trusted\.LauncherActivity/);
assert.match(iosController, /didFailProvisionalNavigation/);
assert.match(iosController, /decidePolicyFor navigationResponse/);
assert.match(iosController, /axiom\.connectivity\.retry/);
assert.match(iosController, /NSURLErrorNotConnectedToInternet/);
assert.doesNotMatch(iosController, /nonPersistent\(\)/);

console.log('Mobile connectivity fallback contract checks passed.');
