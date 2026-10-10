// Run with a temporary @electric-sql/pglite installation path as argv[2].
// This creates an isolated in-memory PostgreSQL database; never connects to Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2]));

async function main() {
  const db = new PGlite();
  let checks = 0;
  const expectRejected = async (sql, params = []) => {
    await assert.rejects(db.query(sql, params), error => error.code === '23514');
    checks++;
  };
  await db.exec(`
    CREATE TABLE projects (id uuid PRIMARY KEY, name text, organization_id uuid NOT NULL, team_id uuid, column_config jsonb);
    CREATE TABLE tasks (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), organization_id uuid NOT NULL,
      team_id uuid NOT NULL, status text NOT NULL, board_position integer DEFAULT 0, title text);
  `);
  const project = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const org = '20000000-0000-4000-8000-000000000001';
  const team = '30000000-0000-4000-8000-000000000001';
  const task = '40000000-0000-4000-8000-000000000001';
  const open = '50000000-0000-4000-8000-000000000001';
  const closed = '50000000-0000-4000-8000-000000000002';
  const foreign = '50000000-0000-4000-8000-000000000003';
  const config = [{ id: open, title: 'Notes', isTerminal: false }, { id: closed, title: 'Rejected', isTerminal: true }];
  // Existing orphan fixture demonstrates no automatic repair or removal during migration.
  await db.query('INSERT INTO projects VALUES ($1,$2,$3,$4,$5)', [other, 'Legacy', org, team, JSON.stringify([{ id: foreign, title: 'Other' }])]);
  await db.query('INSERT INTO tasks(id,project_id,organization_id,team_id,status) VALUES ($1,$2,$3,$4,$5)',
    ['40000000-0000-4000-8000-000000000099', other, org, team, 'orphan']);
  const badConfigs = [[], {}, [config[0], config[0]], config.map(c => ({ ...c, isTerminal: true }))];
  for (let index = 0; index < badConfigs.length; index++) {
    await db.query('INSERT INTO projects VALUES ($1,$2,$3,$4,$5)',
      [`10000000-0000-4000-8000-00000000001${index}`, 'Preflight fixture', org, team, JSON.stringify(badConfigs[index])]);
  }
  await db.exec(fs.readFileSync('supabase/migrations/20261010120000_stage_identity_guards.sql', 'utf8'));
  await db.query('INSERT INTO projects VALUES ($1,$2,$3,$4,$5)', [project, 'Process', org, team, JSON.stringify(config)]);
  await db.query('INSERT INTO tasks(id,project_id,organization_id,team_id,status) VALUES ($1,$2,$3,$4,$5)', [task, project, org, team, open]); checks++;
  const changed = [{ ...config[1], color: 'red' }, { ...config[0], title: 'Renamed', color: 'blue' }];
  await db.query('UPDATE projects SET column_config=$1 WHERE id=$2', [JSON.stringify(changed), project]);
  assert.equal((await db.query('SELECT status FROM tasks WHERE id=$1', [task])).rows[0].status, open); checks++;
  await expectRejected('UPDATE projects SET column_config=$1 WHERE id=$2', [JSON.stringify([config[1]]), project]);
  await expectRejected('UPDATE tasks SET status=$1 WHERE id=$2', [foreign, task]);
  await expectRejected('UPDATE tasks SET project_id=$1 WHERE id=$2', [other, task]);
  await expectRejected('UPDATE tasks SET organization_id=$1 WHERE id=$2', [other, task]);
  await expectRejected('UPDATE projects SET team_id=$1 WHERE id=$2', [other, project]);
  for (const invalid of [[], {}, null, [config[0], config[0]], [{ id: open, title: 'X', isTerminal: 'yes' }]]) {
    await expectRejected('UPDATE projects SET column_config=$1 WHERE id=$2', [JSON.stringify(invalid), project]);
  }
  await db.query('UPDATE tasks SET status=$1,board_position=7 WHERE id=$2', [closed, task]);
  assert.deepEqual((await db.query('SELECT status,board_position FROM tasks WHERE id=$1', [task])).rows[0], { status: closed, board_position: 7 }); checks++;
  await db.query('UPDATE tasks SET status=$1 WHERE id=$2', [open, task]);
  await db.query('INSERT INTO tasks(id,organization_id,team_id,status) VALUES ($1,$2,$3,$4)', ['40000000-0000-4000-8000-000000000002', org, team, 'review']); checks++;
  await db.query("UPDATE tasks SET title='Still editable' WHERE status='orphan'");
  const preflight = await db.exec(fs.readFileSync('supabase/validation/stage_identity_preflight.sql', 'utf8'));
  const findings = preflight.flatMap(result => result.rows);
  assert.ok(findings.some(row => row.issue === 'orphan_status'));
  assert.ok(findings.some(row => row.issue === 'general_unscoped_action')); checks++;
  for (const issue of ['empty_or_malformed_config', 'duplicate_column_id', 'multiple_terminal_columns']) {
    assert.ok(findings.some(row => row.issue === issue), issue); checks++;
  }
  // Re-applying the guard migration is safe; existing data is unchanged.
  await db.exec(fs.readFileSync('supabase/migrations/20261010120000_stage_identity_guards.sql', 'utf8'));
  assert.equal((await db.query("SELECT count(*)::int AS count FROM tasks WHERE status='orphan'")).rows[0].count, 1); checks++;
  await db.close();
  console.log(`${checks} PostgreSQL persistence/preflight regression checks passed. Production data not accessed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
