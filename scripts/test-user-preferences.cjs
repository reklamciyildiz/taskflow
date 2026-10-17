const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NextRequest, NextResponse } = require('next/server');

async function main() {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-preferences-')), 'route.cjs');
  const settings = new Map();
  const actionPreferences = new Map();
  let actor = { id: 'user-1', organization_id: 'org-1' };
  let teamAllowed = true;
  let taskAllowed = true;
  const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const taskA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const taskB = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const visible = [
    { id: '11111111-1111-4111-8111-111111111111' },
    { id: '22222222-2222-4222-8222-222222222222' },
  ];
  const db = { from(table) {
    let filters = {}, update = null, insert = null, upsert = null;
    const key = () => table === 'user_settings'
      ? filters.user_id
      : `${filters.user_id ?? upsert?.user_id}:${filters.task_id ?? upsert?.task_id}`;
    const store = table === 'user_settings' ? settings : actionPreferences;
    const result = () => {
      if (upsert) { store.set(`${upsert.user_id}:${upsert.task_id}`, { ...upsert }); return store.get(`${upsert.user_id}:${upsert.task_id}`); }
      if (insert) { store.set(insert.user_id, { ...insert }); return store.get(insert.user_id); }
      if (update) {
        const row = store.get(key());
        if (!row) return null;
        Object.assign(row, update);
        return row;
      }
      return store.get(key()) ?? null;
    };
    const query = {
      select() { return query; },
      eq(field, value) { filters[field] = value; return query; },
      update(value) { update = value; return query; },
      insert(value) { insert = value; return query; },
      upsert(value) { upsert = value; return query; },
      maybeSingle: async () => ({ data: result(), error: null }),
      single: async () => ({ data: result(), error: null }),
    };
    return query;
  } };
  globalThis.__preferenceTest = {
    db,
    auth: () => ({ user: actor }),
    teamAccess: () => teamAllowed
      ? { teamId, organizationId: 'org-1', orgAdmin: false }
      : NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    taskAccess: () => taskAllowed
      ? { user: actor, task: { id: taskA } }
      : NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    visible: () => visible,
    NextResponse,
  };
  await esbuild.build({
    entryPoints: ['app/api/users/preferences/route.ts'], outfile: output, bundle: true, platform: 'node',
    plugins: [{ name: 'preferences-stubs', setup(build) {
      build.onResolve({ filter: /^next\/server$/ }, args => ({ path: args.path, namespace: 'stub' }));
      build.onResolve({ filter: /^@\/lib\/(db|server-authz|note-server|supabase-admin)$/ }, args => ({ path: args.path, namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents:
        args.path === 'next/server'
          ? 'export const NextResponse = globalThis.__preferenceTest.NextResponse;'
          : args.path.endsWith('supabase-admin')
            ? 'export const supabaseAdmin = globalThis.__preferenceTest.db;'
            : args.path.endsWith('server-authz')
              ? 'export const requireAuthedUser = async () => globalThis.__preferenceTest.auth(); export const requireTeamScopeAccess = async () => globalThis.__preferenceTest.teamAccess();'
              : args.path.endsWith('note-server')
                ? 'export const requireTaskNoteAccess = async () => globalThis.__preferenceTest.taskAccess();'
                : 'export const projectDb = { getVisibleForUser: async () => globalThis.__preferenceTest.visible() };',
      }));
    } }],
  });
  const route = require(output);
  const request = (url, body) => new NextRequest(url, body ? { method: 'PATCH', body: JSON.stringify(body) } : undefined);

  const defaults = await (await route.GET(request('http://localhost/api/users/preferences'))).json();
  assert.deepEqual(defaults.data, { processOrderByTeam: {} });

  const saveA = await route.PATCH(request('http://localhost/api/users/preferences', {
    taskId: taskA, actionPanelTabOrder: 'notes_first',
  }));
  assert.equal(saveA.status, 200);
  assert.equal((await saveA.json()).data.actionPanelTabOrder, 'notes_first');
  const readA = await (await route.GET(request(`http://localhost/api/users/preferences?taskId=${taskA}`))).json();
  assert.equal(readA.data.actionPanelTabOrder, 'notes_first');
  const readB = await (await route.GET(request(`http://localhost/api/users/preferences?taskId=${taskB}`))).json();
  assert.equal(readB.data.actionPanelTabOrder, 'checklist_first');

  const validResponse = await route.PATCH(request('http://localhost/api/users/preferences', {
    teamId, processOrder: [visible[1].id, visible[0].id],
  }));
  assert.equal(validResponse.status, 200);
  assert.deepEqual((await validResponse.json()).data.processOrderByTeam[teamId], [visible[1].id, visible[0].id]);

  const forbidden = await route.PATCH(request('http://localhost/api/users/preferences', {
    teamId, processOrder: ['33333333-3333-4333-8333-333333333333'],
  }));
  assert.equal(forbidden.status, 403);
  taskAllowed = false;
  const forbiddenTask = await route.PATCH(request('http://localhost/api/users/preferences', {
    taskId: taskA, actionPanelTabOrder: 'checklist_first',
  }));
  assert.equal(forbiddenTask.status, 403);
  taskAllowed = true;
  teamAllowed = false;
  const crossTeam = await route.PATCH(request('http://localhost/api/users/preferences', { teamId, processOrder: [] }));
  assert.equal(crossTeam.status, 403);

  actor = { id: 'user-2', organization_id: 'org-1' };
  teamAllowed = true;
  const secondUser = await (await route.GET(request(`http://localhost/api/users/preferences?taskId=${taskA}`))).json();
  assert.equal(secondUser.data.actionPanelTabOrder, 'checklist_first');
  assert.equal(actionPreferences.get(`user-1:${taskA}`).action_panel_tab_order, 'notes_first');
  console.log(JSON.stringify({ preferenceChecks: 12, productionAccess: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
