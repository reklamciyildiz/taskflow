/* P2.3.1: real concurrent PostgreSQL sessions, never a simulated transaction. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const org = '11111111-1111-4111-8111-111111111111';
const team = '33333333-3333-4333-8333-333333333333';
const env = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Attach rejection handlers immediately, before the other transaction commits.
// Node 22 otherwise treats an expected concurrent SQL rejection as unhandled.
const captureConflict = promise => promise.then(() => null, error => error);
async function expectConflict(promise, message) {
  const error = await promise;
  assert.ok(error, 'Concurrent write unexpectedly succeeded');
  assert.equal(error.code, '23514', 'Must reject as a DB integrity violation');
  assert.equal(error.message, message);
}

async function main() {
  const first = new Client(env), second = new Client(env);
  await Promise.all([first.connect(), second.connect()]);
  const ids = Array.from({ length: 6 }, () => randomUUID());
  let cases = 0;
  try {
    await Promise.all([
      first.query("SET statement_timeout = '9000ms'"),
      second.query("SET statement_timeout = '9000ms'"),
    ]);
    for (const id of ids) {
      await first.query('INSERT INTO tasks(id,organization_id,team_id,status) VALUES($1,$2,$3,$4)', [id, org, team, 'todo']);
    }
    // Two opposite edges racing for the same graph must not create a cycle.
    await first.query('BEGIN');
    await first.query('INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES($1,$2,$3,$4)',
      [ids[0], ids[1], org, team]);
    const opposite = captureConflict(second.query('INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES($1,$2,$3,$4)',
      [ids[1], ids[0], org, team]));
    await sleep(120);
    await first.query('COMMIT');
    await expectConflict(opposite, 'P23_DEPENDENCY_CYCLE');
    cases++;

    // Dependency committed first => concurrent terminal transition must fail.
    await first.query('BEGIN');
    await first.query('INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES($1,$2,$3,$4)',
      [ids[2], ids[3], org, team]);
    const finish = captureConflict(second.query("UPDATE tasks SET status='done' WHERE id=$1", [ids[3]]));
    await sleep(120);
    await first.query('COMMIT');
    await expectConflict(finish, 'P23_BLOCKED_COMPLETION');
    const state1 = await first.query('SELECT status FROM tasks WHERE id=$1', [ids[3]]);
    assert.equal(state1.rows[0].status, 'todo', 'Blocked completion partially persisted');
    cases++;

    // Completion committed first => a new unfinished predecessor cannot be
    // attached after the target is already marked terminal.
    await first.query('BEGIN');
    await first.query("UPDATE tasks SET status='done' WHERE id=$1", [ids[5]]);
    const link = captureConflict(second.query('INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES($1,$2,$3,$4)',
      [ids[4], ids[5], org, team]));
    await sleep(120);
    await first.query('COMMIT');
    await expectConflict(link, 'P23_DEPENDENCY_TERMINAL_TARGET');
    cases++;

    const stillAlive = await first.query('SELECT COUNT(*)::int AS count FROM tasks WHERE id=ANY($1::uuid[])', [ids]);
    assert.equal(stillAlive.rows[0].count, ids.length);
    console.log(JSON.stringify({ suite: 'task-dependency-concurrency', cases, concurrency: 'two real PostgreSQL sessions', passed: true }));
  } finally {
    await first.query('ROLLBACK').catch(() => {});
    await second.query('ROLLBACK').catch(() => {});
    await first.query('DELETE FROM tasks WHERE id=ANY($1::uuid[])', [ids]).catch(() => {});
    await Promise.all([first.end(), second.end()]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
