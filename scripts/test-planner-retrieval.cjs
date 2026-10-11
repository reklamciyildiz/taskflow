// Real retrieval module against deterministic database responses, no live credentials.
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-planner-retrieval-'));
  const date = '2026-10-11';
  const doc = { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem',
    attrs: { id: 'item', checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Large checklist '.repeat(3000) }] }] }] }] };
  const tasks = Array.from({ length: 60 }, (_, i) => ({ id: `task-${i}`, title: `Action ${i}`, status: 'todo',
    assignee_id: null, project_id: 'project', team_id: 'team', organization_id: 'org',
    updated_at: `${date}T08:00:00Z`, checklist_blocks: doc }));
  const schedules = tasks.map(task => ({ id: `schedule-${task.id}`, organization_id: 'org', team_id: 'team',
    task_id: task.id, checklist_item_id: null, schedule_type: 'one_off', schedule_date: date,
    schedule_time: null, time_zone: null, recurrence_frequency: null, recurrence_interval: 1,
    recurrence_weekdays: [], ends_on: null, reminder_rules: [], archived_at: null,
    created_at: `${date}T08:00:00Z`, updated_at: `${date}T08:00:00Z` }));
  const rows = { tasks, work_schedules: schedules, work_occurrences: [],
    projects: [{ id: 'project', name: 'Process', team_id: 'team', organization_id: 'org', visibility: 'team', column_config: [{ id: 'todo', title: 'Todo' }] }], project_members: [] };
  const outputs = [];
  const measurements = [];
  for (const baseline of [true, false]) {
    const queries = [];
    let taskBytes = 0;
    globalThis.__plannerDb = { from(table) {
      let result = rows[table];
      let columns = '*';
      const query = {
        select(value) { columns = value; return query; },
        eq(field, value) { result = result.filter(row => row[field] === value); return query; },
        is(field, value) { result = result.filter(row => row[field] === value); return query; },
        in(field, values) { result = result.filter(row => values.includes(row[field])); return query; },
        lte(field, value) { result = result.filter(row => row[field] <= value); return query; },
        gte(field, value) { result = result.filter(row => row[field] >= value); return query; },
        or() { return query; },
        then(resolve, reject) {
          queries.push({ table, columns });
          const data = result.map(row => columns === '*' ? row : Object.fromEntries(columns.split(',').map(key => [key, row[key]])));
          if (table === 'tasks') taskBytes += Buffer.byteLength(JSON.stringify(data));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    } };
    const file = path.join(output, `${baseline ? 'before' : 'after'}.cjs`);
    await esbuild.build({ entryPoints: ['lib/planner-retrieval-server.ts'], outfile: file, bundle: true, platform: 'node', plugins: [{ name: 'test-db', setup(build) {
      build.onResolve({ filter: /^(server-only|@\/lib\/supabase-admin|@\/lib\/server-authz)$/ }, args => ({ path: args.path, namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('server-authz') ? 'export const isOrgAdmin = actor => actor.role === "admin";' : 'export const supabaseAdmin = globalThis.__plannerDb;' }));
      if (baseline) build.onLoad({ filter: /planner-retrieval-server\.ts$/ }, args => ({ contents: execFileSync('git', ['show', 'HEAD:lib/planner-retrieval-server.ts'], { encoding: 'utf8' }), loader: 'ts', resolveDir: path.dirname(args.path) }));
    } }] });
    const { getPlannerTodayProjection } = require(file);
    outputs.push(await getPlannerTodayProjection({ userId: 'user', organizationId: 'org', role: 'admin' }, date,
      { teamId: 'team', teamAccessVerified: true, timeZone: 'Europe/Istanbul' }));
    measurements.push({ baseline, queries: queries.length, occurrenceQueries: queries.filter(q => q.table === 'work_occurrences').length, taskBytes });
  }
  assert.deepEqual(outputs[1], outputs[0], 'optimization must preserve projection semantics');
  assert.equal(outputs[1].today.length, 60);
  assert.equal(measurements[1].occurrenceQueries, 0);
  assert.ok(measurements[1].taskBytes < measurements[0].taskBytes / 100);
  console.log(JSON.stringify({ measurements, actionRows: outputs[1].today.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
