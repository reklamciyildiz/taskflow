/* P2.3.1 API contract exercised with the real bundled route and isolated services.
   PostgreSQL invariants are tested separately against two real DB connections. */
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { build } = require('esbuild');

const ids = {
  root: '00000000-0000-4000-8000-000000000011',
  visible: '00000000-0000-4000-8000-000000000012',
  hidden: '00000000-0000-4000-8000-000000000013',
  target: '00000000-0000-4000-8000-000000000014',
  otherTeam: '00000000-0000-4000-8000-000000000015',
};
const org = '11111111-1111-4111-8111-111111111111';
const team = '33333333-3333-4333-8333-333333333333';
const visibleProject = '99999999-9999-4999-8999-999999999991';
const hiddenProject = '99999999-9999-4999-8999-999999999992';
const stages = [{ id: 'todo', isTerminal: false }, { id: 'done', isTerminal: true }];
const state = {
  role: 'member',
  unreadable: new Set([ids.hidden]),
  accesses: [], inserts: [], deleted: [], rejectInsert: null,
  tasks: [
    { id: ids.root, title: 'My Action', organization_id: org, team_id: team, project_id: null, status: 'todo' },
    { id: ids.visible, title: 'Visible done', organization_id: org, team_id: team, project_id: visibleProject, status: 'done' },
    { id: ids.hidden, title: 'SECRET PRIVATE ACTION', organization_id: org, team_id: team, project_id: hiddenProject, status: 'todo' },
    { id: ids.target, title: 'New target', organization_id: org, team_id: team, project_id: visibleProject, status: 'todo' },
    { id: ids.otherTeam, title: 'Other team', organization_id: org, team_id: '44444444-4444-4444-8444-444444444444', project_id: null, status: 'todo' },
  ],
  projects: [
    { id: visibleProject, column_config: stages },
    { id: hiddenProject, column_config: stages },
  ],
  edges: [
    { id: 'e1', blocker_task_id: ids.visible, blocked_task_id: ids.root, organization_id: org, team_id: team, created_at: '2026-11-15' },
    { id: 'e2', blocker_task_id: ids.hidden, blocked_task_id: ids.root, organization_id: org, team_id: team, created_at: '2026-11-15' },
  ],
};

class FakeNextResponse {
  constructor(body, status = 200) { this.body = body; this.status = status; }
  static json(body, opts) { return new FakeNextResponse(body, opts?.status ?? 200); }
}
class Query {
  constructor(table) { this.table = table; this.filters = []; this.inFilters = []; this.orFilter = null; this.kind = 'read'; }
  select() { return this; }
  eq(key, value) { this.filters.push([key, String(value)]); return this; }
  in(key, values) { this.inFilters.push([key, values.map(String)]); return this; }
  or(value) { this.orFilter = value; return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload) {
    state.inserts.push(payload);
    if (state.rejectInsert) {
      const code = state.rejectInsert; state.rejectInsert = null;
      return Promise.resolve({ error: { code: '23514', message: code } });
    }
    state.edges.push({ ...payload, id: 'edge-new', created_at: '2026-11-15' });
    return Promise.resolve({ error: null });
  }
  delete() { this.kind = 'delete'; return this; }
  async result() {
    const rows = this.table === 'task_dependencies' ? state.edges
      : this.table === 'projects' ? state.projects : state.tasks;
    const match = row => {
      if (!this.filters.every(([key, v]) => String(row[key]) === v)) return false;
      if (!this.inFilters.every(([key, vals]) => vals.includes(String(row[key])))) return false;
      if (!this.orFilter) return true;
      const values = this.orFilter.split(',').map(part => part.split('.').at(-1));
      return String(row.blocker_task_id) === values[0] || String(row.blocked_task_id) === values[1];
    };
    const matches = rows.filter(match);
    if (this.kind === 'delete') {
      state.deleted.push(...matches);
      state.edges = state.edges.filter(row => !matches.includes(row));
      return { error: null };
    }
    return { data: matches, error: null };
  }
  async maybeSingle() {
    const out = await this.result();
    return { data: out.data[0] ?? null, error: null };
  }
  then(resolve, reject) { return this.result().then(resolve, reject); }
}
globalThis.__p23 = {
  NextResponse: FakeNextResponse,
  supabaseAdmin: { from: table => new Query(table) },
  projectDb: { getVisibleForUser: async () => state.projects.filter(p => p.id !== hiddenProject) },
  requireAccess: async (id, opts) => {
    state.accesses.push({ id, mutate: opts.mutate });
    const task = state.tasks.find(t => t.id === id);
    if (!task || state.unreadable.has(id)) return FakeNextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (opts.mutate && state.role === 'viewer') return FakeNextResponse.json({ error: 'Read only' }, { status: 403 });
    return { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organization_id: org }, task };
  },
  readInboxBoard: async () => ({ configured: true, available: true, stages, version: 1 }),
};

const stubs = {
  'next/server': 'export const NextResponse = globalThis.__p23.NextResponse;',
  '@/lib/supabase-admin': 'export const supabaseAdmin = globalThis.__p23.supabaseAdmin;',
  '@/lib/db': 'export const projectDb = globalThis.__p23.projectDb;',
  '@/lib/note-server': 'export const requireTaskNoteAccess = globalThis.__p23.requireAccess;',
  '@/lib/inbox-board-server': 'export const readInboxBoard = globalThis.__p23.readInboxBoard;',
  '@/lib/types': 'export function parseColumnConfigFromJson(raw){ return Array.isArray(raw) ? raw : []; }',
  '@/lib/stage-lifecycle': 'export function resolveStageLifecycle(status, columns){ return { isTerminal:columns.some(c=>c.id===status && c.isTerminal===true) }; }',
};
async function compile() {
  const built = await build({
    entryPoints: ['app/api/tasks/[id]/dependencies/route.ts'],
    absWorkingDir: process.cwd(), platform: 'node', format: 'cjs',
    bundle: true, write: false, logLevel: 'silent',
    plugins: [{
      name: 'isolate-services',
      setup(api) {
        api.onResolve({ filter: /^(next\/server|@\/lib\/.*)$/ }, args => {
          if (args.path === '@/lib/task-dependencies') return {
            path: path.join(process.cwd(), 'lib/task-dependencies.ts'),
          };
          if (stubs[args.path]) return { path: args.path, namespace: 'p23-fixture' };
          throw new Error('Unexpected real server dependency: ' + args.path);
        });
        api.onLoad({ filter: /.*/, namespace: 'p23-fixture' }, args =>
          ({ contents: stubs[args.path], loader: 'js' }));
      },
    }],
  });
  const compiled = new Module(path.resolve('p23-test-route.cjs'), module);
  compiled.filename = path.resolve('p23-test-route.cjs');
  compiled.paths = module.paths;
  compiled._compile(built.outputFiles[0].text, compiled.filename);
  return compiled.exports;
}
async function main() {
  const route = await compile();
  const request = value => ({ json: async () => value });
  const current = { params: { id: ids.root } };

  // A private project's task identity and title must never escape GET.
  const overview = await route.GET(request(null), current);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.data.blocked, true);
  assert.deepEqual(overview.body.data.blockedBy.map(link => link.taskId), [ids.visible]);
  assert.equal(JSON.stringify(overview.body).includes(ids.hidden), false);
  assert.equal(JSON.stringify(overview.body).includes('SECRET PRIVATE ACTION'), false);

  // Viewer may read but cannot create or delete links.
  state.role = 'viewer';
  assert.equal((await route.GET(request(null), current)).status, 200);
  assert.equal((await route.POST(request({ blockerTaskId: ids.target }), current)).status, 403);
  state.role = 'member';

  // A peer in a private project cannot be linked or unlinked.
  assert.equal((await route.POST(request({ blockerTaskId: ids.hidden }), current)).status, 404);
  assert.equal((await route.DELETE(request({ blockerTaskId: ids.hidden }), current)).status, 404);

  // Cross-team requests and self-loops are rejected before reaching storage.
  assert.equal((await route.POST(request({ blockerTaskId: ids.otherTeam }), current)).status, 403);
  assert.equal((await route.POST(request({ blockerTaskId: ids.root }), current)).status, 400);
  assert.equal((await route.POST(request({ blockerTaskId: ids.visible, blockedTaskId: ids.target }), current)).status, 400);

  // Valid duplicate links do not re-enter the DB trigger (e.g. after a reopen).
  const before = state.inserts.length;
  assert.equal((await route.POST(request({ blockerTaskId: ids.visible }), current)).status, 200);
  assert.equal(state.inserts.length, before);

  // The URL Action may be the blocker. Record canonical identity only.
  const created = await route.POST(request({ blockedTaskId: ids.target }), current);
  assert.equal(created.status, 201);
  assert.equal(state.inserts.at(-1).blocker_task_id, ids.root);
  assert.equal(state.inserts.at(-1).blocked_task_id, ids.target);
  assert.equal(state.inserts.at(-1).organization_id, org);
  assert.equal(state.inserts.at(-1).team_id, team);
  assert.equal(state.inserts.at(-1).created_by, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  state.rejectInsert = 'P23_DEPENDENCY_CYCLE';
  assert.equal((await route.POST(request({ blockerTaskId: ids.target }), current)).status, 409);

  const deleted = await route.DELETE(request({ blockedTaskId: ids.target }), current);
  assert.equal(deleted.status, 200);
  assert.equal(state.edges.some(e => e.blocker_task_id === ids.root && e.blocked_task_id === ids.target), false);
  assert.ok(state.accesses.some(a => a.id === ids.target && a.mutate), 'Peer ACL check must execute');
  console.log(JSON.stringify({ suite: 'p23-actual-api-route', checks: 19, passed: true }));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
