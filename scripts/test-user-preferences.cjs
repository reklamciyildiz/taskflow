const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NextRequest, NextResponse } = require('next/server');

async function main() {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-preferences-')), 'route.cjs');
  const rows = new Map();
  let actor = { id: 'user-1', organization_id: 'org-1' };
  let teamAllowed = true;
  const visible = [
    { id: '11111111-1111-4111-8111-111111111111' },
    { id: '22222222-2222-4222-8222-222222222222' },
  ];
  const db = { from(table) {
    assert.equal(table, 'user_settings');
    let userId = null, update = null, insert = null;
    const result = () => {
      if (insert) { rows.set(insert.user_id, { ...insert }); return rows.get(insert.user_id); }
      if (update) {
        const row = rows.get(userId);
        if (!row) return null;
        Object.assign(row, update);
        return row;
      }
      return rows.get(userId) ?? null;
    };
    const query = {
      select() { return query; },
      eq(key, value) { if (key === 'user_id') userId = value; return query; },
      update(value) { update = value; return query; },
      insert(value) { insert = value; return query; },
      maybeSingle: async () => ({ data: result(), error: null }),
      single: async () => ({ data: result(), error: null }),
    };
    return query;
  } };
  globalThis.__preferenceTest = {
    db,
    auth: () => ({ user: actor }),
    teamAccess: () => teamAllowed
      ? { teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organizationId: 'org-1', orgAdmin: false }
      : NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    visible: () => visible,
    NextResponse,
  };
  await esbuild.build({
    entryPoints: ['app/api/users/preferences/route.ts'], outfile: output, bundle: true, platform: 'node',
    plugins: [{ name: 'preferences-stubs', setup(build) {
      build.onResolve({ filter: /^next\/server$/ }, args => ({ path: args.path, namespace: 'stub' }));
      build.onResolve({ filter: /^@\/lib\/(db|server-authz|supabase-admin)$/ }, args => ({ path: args.path, namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents:
        args.path === 'next/server'
          ? 'export const NextResponse = globalThis.__preferenceTest.NextResponse;'
          : args.path.endsWith('supabase-admin')
          ? 'export const supabaseAdmin = globalThis.__preferenceTest.db;'
          : args.path.endsWith('server-authz')
            ? 'export const requireAuthedUser = async () => globalThis.__preferenceTest.auth(); export const requireTeamScopeAccess = async () => globalThis.__preferenceTest.teamAccess();'
            : 'export const projectDb = { getVisibleForUser: async () => globalThis.__preferenceTest.visible() };',
      }));
    } }],
  });
  const route = require(output);
  const get = async () => (await route.GET()).json();
  assert.deepEqual((await get()).data, { actionPanelTabOrder: 'checklist_first', processOrderByTeam: {} });

  const tabResponse = await route.PATCH(new NextRequest('http://localhost/api/users/preferences', {
    method: 'PATCH', body: JSON.stringify({ actionPanelTabOrder: 'notes_first' }),
  }));
  assert.equal(tabResponse.status, 200);
  assert.equal((await tabResponse.json()).data.actionPanelTabOrder, 'notes_first');

  const teamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const validResponse = await route.PATCH(new NextRequest('http://localhost/api/users/preferences', {
    method: 'PATCH', body: JSON.stringify({ teamId, processOrder: [visible[1].id, visible[0].id] }),
  }));
  assert.equal(validResponse.status, 200);
  assert.deepEqual((await validResponse.json()).data.processOrderByTeam[teamId], [visible[1].id, visible[0].id]);

  const forbidden = await route.PATCH(new NextRequest('http://localhost/api/users/preferences', {
    method: 'PATCH', body: JSON.stringify({ teamId, processOrder: ['33333333-3333-4333-8333-333333333333'] }),
  }));
  assert.equal(forbidden.status, 403);
  teamAllowed = false;
  const crossTeam = await route.PATCH(new NextRequest('http://localhost/api/users/preferences', {
    method: 'PATCH', body: JSON.stringify({ teamId, processOrder: [] }),
  }));
  assert.equal(crossTeam.status, 403);

  actor = { id: 'user-2', organization_id: 'org-1' };
  teamAllowed = true;
  assert.deepEqual((await get()).data, { actionPanelTabOrder: 'checklist_first', processOrderByTeam: {} });
  assert.equal(rows.get('user-1').action_panel_tab_order, 'notes_first');
  console.log(JSON.stringify({ preferenceChecks: 9, productionAccess: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
