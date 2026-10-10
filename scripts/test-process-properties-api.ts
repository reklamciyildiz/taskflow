// Exercise actual route handlers and shared authorization with isolated database/session doubles.
// Persistence/constraints/RLS are tested separately against PostgreSQL, not this double.
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const installMock = (name: string, exports: unknown) => {
  const filename = require.resolve(name);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as NodeModule;
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = id(1), teamId = id(2), orgId = id(3), userId = id(4), taskId = id(5), propertyId = id(6), optionId = id(7);
let actor: any = { id: userId, organization_id: orgId, role: 'member' };
let signedIn = true;
let membership: any = { role: 'member' };
let visible = true;
let projectTeam: string | null = teamId;
let taskProject: string | null = projectId;
let databaseCalls = 0;
let writes = 0;
const rows: Record<string, any[]> = {
  process_properties: [{ id: propertyId, project_id: projectId, name: 'Region', type: 'single_select', position: 0, archived_at: null }],
  process_property_options: [{ id: optionId, property_id: propertyId, project_id: projectId, label: 'Europe', color: 'blue', position: 0, archived_at: null }],
  action_property_values: [],
};
const fakeDb = { from: (table: string) => {
  databaseCalls++;
  let data = [...(rows[table] ?? [])];
  let single = false;
  const query: any = {
    select: () => query,
    eq: (key: string, value: unknown) => { if (!key.includes('.')) data = data.filter(row => row[key] === value); return query; },
    is: (key: string, value: unknown) => { data = data.filter(row => row[key] === value); return query; },
    order: () => query, range: () => query, limit: () => query,
    insert: () => { writes++; data = [{ id: id(99) }]; return query; },
    update: () => { writes++; return query; },
    delete: () => { writes++; return query; },
    upsert: () => { writes++; return query; },
    maybeSingle: () => { single = true; return query; },
    single: () => { single = true; return query; },
    then: (resolve: any, reject: any) => Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject),
  };
  return query;
} };
// Next resolves this marker at build time; plain Node has no runtime package for it.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name: string, ...args: unknown[]) {
  return name === 'server-only' ? {} : originalLoad.call(this, name, ...args);
};
installMock('../lib/auth', { authOptions: {} });
installMock('next-auth', { getServerSession: async () => signedIn ? { user: { email: 'fixture@example.test' } } : null });
installMock('../lib/supabase-admin', { supabaseAdmin: fakeDb });
installMock('../lib/db', {
  userDb: { getByEmail: async () => actor },
  teamDb: { getById: async () => ({ id: teamId, organization_id: orgId }) },
  teamMemberDb: { getMembership: async () => membership },
  taskDb: { getById: async () => ({ id: taskId, project_id: taskProject, team_id: teamId, organization_id: orgId }) },
  projectDb: { getVisibleForUser: async () => visible ? [{ id: projectId, team_id: projectTeam, organization_id: orgId }] : [] },
});
const definitionRoutes = require('../app/api/projects/[id]/properties/route');
const valueRoute = require('../app/api/tasks/[id]/properties/route');
const request = (method: string, body?: unknown) => new NextRequest(`http://localhost/api/projects/${projectId}/properties?teamId=${teamId}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
});
let checks = 0;
async function expectStatus(call: () => Promise<Response>, status: number, noDatabase = false) {
  const before = databaseCalls;
  const beforeWrites = writes;
  const response = await call();
  assert.equal(response.status, status, await response.text());
  if (noDatabase) assert.equal(databaseCalls, before);
  if (status >= 400) assert.equal(writes, beforeWrites);
  checks++;
}
const read = () => definitionRoutes.GET(request('GET'), { params: { id: projectId } });
const manage = (body: unknown = { operation: 'create_property', name: 'Region' }) => definitionRoutes.POST(request('POST', body), { params: { id: projectId } });
const assign = (body: unknown = { propertyId, optionId }) => valueRoute.PUT(request('PUT', body), { params: { id: taskId } });
async function main() {
  signedIn = false; await expectStatus(read, 401, true); await expectStatus(manage, 401, true); await expectStatus(assign, 401, true);
  signedIn = true; actor.organization_id = id(100); await expectStatus(read, 403, true); await expectStatus(assign, 403, true);
  actor.organization_id = orgId; membership = null; await expectStatus(read, 403, true); await expectStatus(assign, 403, true);
  membership = { role: 'viewer' }; await expectStatus(read, 200); await expectStatus(manage, 403, true); await expectStatus(assign, 403, true);
  membership = { role: 'member' }; visible = false; await expectStatus(read, 404, true); await expectStatus(assign, 404, true);
  actor.role = 'owner'; await expectStatus(manage, 404, true); // Org ownership must not bypass a private Process ACL.
  actor.role = 'member'; visible = true; await expectStatus(manage, 403, true); await expectStatus(assign, 200);
  await expectStatus(() => assign({ propertyId: id(999), optionId }), 400);
  await expectStatus(() => assign({ propertyId, optionId, status: 'done' }), 400, true);
  taskProject = null; await expectStatus(assign, 400, true); taskProject = projectId;
  membership = { role: 'admin' }; await expectStatus(manage, 200);
  await expectStatus(() => manage({ operation: 'create_property', name: 'Priority' }), 400, true);
  projectTeam = null; await expectStatus(manage, 403, true);
  actor.role = 'owner'; await expectStatus(manage, 200);
  console.log(`${checks} actual property API authorization/validation checks passed with isolated session/database doubles.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
export {};
