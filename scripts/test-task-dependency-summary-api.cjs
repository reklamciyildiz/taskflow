/* Execute the actual dependency-summary route with isolated identity and data fixtures.
 * This verifies response ACL and private Process redaction, not just source text.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { build } = require('esbuild');

const ids = {
  visible: '00000000-0000-4000-8000-000000000051',
  target: '00000000-0000-4000-8000-000000000052',
  downstream: '00000000-0000-4000-8000-000000000054',
  private: '00000000-0000-4000-8000-000000000053',
};
const org = '11111111-1111-4111-8111-111111111111';
const team = '33333333-3333-4333-8333-333333333333';
const publicProcess = '99999999-9999-4999-8999-999999999901';
const privateProcess = '99999999-9999-4999-8999-999999999902';
const stageConfig = [{ id: 'todo', isTerminal: false }, { id: 'accepted', isTerminal: true }];
const state = {
  authorized: true,
  member: true,
  failEdges: false,
  edges: [
    { id: '1', organization_id: org, team_id: team, blocker_task_id: ids.private, blocked_task_id: ids.target },
    { id: '2', organization_id: org, team_id: team, blocker_task_id: ids.visible, blocked_task_id: ids.target },
    { id: '3', organization_id: org, team_id: team, blocker_task_id: ids.visible, blocked_task_id: ids.downstream },
  ],
  tasks: [
    { id: ids.visible, organization_id: org, team_id: team, project_id: publicProcess, status: 'accepted' },
    { id: ids.target, organization_id: org, team_id: team, project_id: null, status: 'todo' },
    { id: ids.downstream, organization_id: org, team_id: team, project_id: null, status: 'todo' },
    { id: ids.private, organization_id: org, team_id: team, project_id: privateProcess, status: 'todo' },
  ],
  projects: [
    { id: publicProcess, organization_id: org, column_config: stageConfig },
    { id: privateProcess, organization_id: org, column_config: stageConfig },
  ],
};
class FakeResponse {
  constructor(data, status = 200) { this.body = data; this.status = status; }
  static json(data, opts) { return new FakeResponse(data, opts?.status ?? 200); }
}
class Query {
  constructor(table) { this.table = table; this.equals = []; this.set = []; this.window = null; }
  select() { return this; }
  eq(column, value) { this.equals.push([column, String(value)]); return this; }
  in(column, values) { this.set.push([column, new Set(values.map(String))]); return this; }
  order() { return this; }
  range(start, end) { this.window = [start, end]; return this; }
  async execute() {
    if (state.failEdges && this.table === 'task_dependencies') {
      return { data: null, error: { code: 'PGRST100' } };
    }
    const raw = this.table === 'task_dependencies' ? state.edges
      : this.table === 'tasks' ? state.tasks : state.projects;
    const rows = raw.filter(row =>
      this.equals.every(([col, value]) => String(row[col]) === value)
      && this.set.every(([col, values]) => values.has(String(row[col])))
    );
    const data = this.window ? rows.slice(this.window[0], this.window[1] + 1) : rows;
    return { data, error: null };
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}
globalThis.__p232 = {
  NextResponse: FakeResponse,
  supabaseAdmin: { from: table => new Query(table) },
  requireAuthedUser: async () => state.authorized
    ? { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organization_id: org } }
    : FakeResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
  requireTeamScopeAccess: async () => state.member
    ? { teamId: team, organizationId: org }
    : FakeResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
  projectDb: {
    getVisibleForUser: async () => [{ id: publicProcess, column_config: stageConfig }],
  },
  readInboxBoard: async () => ({ configured: true, stages: [
    { id: 'todo', isTerminal: false }, { id: 'verified', isTerminal: true },
  ] }),
};
const modules = {
  'next/server': 'export const NextResponse = globalThis.__p232.NextResponse;',
  '@/lib/server-authz': 'export const requireAuthedUser=globalThis.__p232.requireAuthedUser; export const requireTeamScopeAccess=globalThis.__p232.requireTeamScopeAccess;',
  '@/lib/db': 'export const projectDb=globalThis.__p232.projectDb;',
  '@/lib/inbox-board-server': 'export const readInboxBoard=globalThis.__p232.readInboxBoard;',
  '@/lib/supabase-admin': 'export const supabaseAdmin=globalThis.__p232.supabaseAdmin;',
  '@/lib/types': 'export function parseColumnConfigFromJson(x){return Array.isArray(x)?x:[];}',
  '@/lib/stage-lifecycle': 'export function resolveStageLifecycle(status,columns){return {isTerminal:columns.some(c=>c.id===status && c.isTerminal)};}',
};
async function getRoute() {
  const output = await build({
    entryPoints: ['app/api/tasks/dependency-summary/route.ts'],
    absWorkingDir: process.cwd(), platform: 'node', format: 'cjs',
    bundle: true, write: false, logLevel: 'silent',
    plugins: [{ name: 'mock-service-boundaries', setup(hooks) {
      hooks.onResolve({ filter: /^(next\/server|@\/lib\/.*)$/ }, args => {
        if (!modules[args.path]) throw Error('Unexpected server import: ' + args.path);
        return { path: args.path, namespace: 'p232-fixture' };
      });
      hooks.onLoad({ filter: /.*/, namespace: 'p232-fixture' }, args =>
        ({ contents: modules[args.path], loader: 'js' }));
    } }],
  });
  const bundled = new Module(path.resolve('p232-route.cjs'), module);
  bundled.filename = path.resolve('p232-route.cjs');
  bundled.paths = module.paths;
  bundled._compile(output.outputFiles[0].text, bundled.filename);
  return bundled.exports;
}
async function main() {
  const route = await getRoute();
  const request = teamId => ({ nextUrl: { searchParams: new URLSearchParams({ teamId }) } });
  const invalid = await route.GET(request('not-a-uuid'));
  assert.equal(invalid.status, 400);

  state.authorized = false;
  assert.equal((await route.GET(request(team))).status, 401);
  state.authorized = true;

  state.member = false;
  assert.equal((await route.GET(request(team))).status, 403);
  state.member = true;

  const response = await route.GET(request(team));
  assert.equal(response.status, 200);
  const flags = response.body.data;
  assert.equal(flags[ids.target].blocked, true, 'Unfinished private prerequisite must count');
  assert.equal(flags[ids.target].hasPredecessors, true);
  assert.equal(flags[ids.target].ready, false);
  assert.equal(flags[ids.visible].blocking, true);
  assert.equal(flags[ids.visible].ready, false, 'Already completed Action is not ready-to-start');
  assert.equal(flags[ids.downstream].ready, true, 'A dependent Action with all prerequisites done is ready');
  assert.equal(Object.hasOwn(flags, ids.private), false, 'Private Process Action ID leaked');
  assert.equal(JSON.stringify(response.body).includes(ids.private), false);
  assert.ok(!Object.values(flags).some(value => 'title' in value));

  state.tasks.find(task => task.id === ids.private).status = 'accepted';
  const unblocked = await route.GET(request(team));
  assert.equal(unblocked.body.data[ids.target].blocked, false,
    'Private Process terminal state must be computed on server');
  assert.equal(unblocked.body.data[ids.target].ready, true,
    'Unfinished target with completed blockers must be ready');

  state.failEdges = true;
  const error = await route.GET(request(team));
  assert.equal(error.status, 503, 'Error must not turn into a false all-ready snapshot');
  assert.equal(error.body.success, false);
  state.failEdges = false;

  state.edges = [];
  const empty = await route.GET(request(team));
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, {});
  console.log(JSON.stringify({ suite: 'P2.3.2 team dependency read model', checks: 16, passed: true }));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
