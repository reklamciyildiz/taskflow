// Uses an isolated PostgreSQL engine. No production connection or app dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2]));
const migration = fs.readFileSync('supabase/migrations/20261011120000_process_single_select_properties.sql', 'utf8');
let database;
async function main() {
  const db = new PGlite();
  database = db;
  let checks = 0;
  const rejected = async (sql, params = [], codes = ['23514','23503','23505','42501']) => {
    await assert.rejects(db.query(sql, params), error => codes.includes(error.code)); checks++;
  };
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const project = id(1), otherProject = id(2), task = id(3), otherTask = id(4), general = id(5), prop = id(6), otherProp = id(7), option = id(8), otherOption = id(9), option2 = id(10);
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE projects(id uuid PRIMARY KEY, name text, column_config jsonb NOT NULL, organization_id uuid NOT NULL, team_id uuid);
    CREATE TABLE tasks(id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id) ON DELETE SET NULL, status text NOT NULL, organization_id uuid NOT NULL, team_id uuid NOT NULL,
      board_position int NOT NULL DEFAULT 0, checklist_blocks jsonb, updated_at timestamptz DEFAULT now());`);
  // Guard precondition must abort before creating tables.
  await assert.rejects(db.exec(migration)); await db.exec('ROLLBACK'); checks++;
  assert.equal((await db.query("SELECT to_regclass('public.process_properties') AS table_name")).rows[0].table_name, null);
  await db.exec(fs.readFileSync('supabase/migrations/20261010120000_stage_identity_guards.sql', 'utf8'));
  const config = JSON.stringify([{ id: 'open', title: 'Work' }, { id: 'closed', title: 'Closed', isTerminal: true }]);
  await db.query('INSERT INTO projects VALUES ($1,$2,$3,$4,$5),($6,$7,$3,$8,$9)', [project,'Hiring',config,id(100),id(101),otherProject,'Other',id(200),id(201)]);
  await db.query('INSERT INTO tasks(id,project_id,status,organization_id,team_id,board_position,checklist_blocks) VALUES ($1,$2,$3,$4,$5,7,$6),($7,$8,$3,$9,$10,2,$6),($11,NULL,$3,$4,$5,0,$6)',
    [task,project,'open',id(100),id(101),JSON.stringify({ type: 'doc', content: [] }),otherTask,otherProject,id(200),id(201),general]);
  await db.exec('ALTER TABLE tasks DISABLE TRIGGER a1_task_stage_integrity');
  await assert.rejects(db.exec(migration)); await db.exec('ROLLBACK'); checks++;
  await db.query("UPDATE tasks SET status='orphan' WHERE id=$1", [task]);
  await db.exec('ALTER TABLE tasks ENABLE TRIGGER a1_task_stage_integrity');
  await assert.rejects(db.exec(migration)); await db.exec('ROLLBACK'); checks++;
  await db.query("UPDATE tasks SET status='open' WHERE id=$1", [task]);
  await db.exec(migration);
  const before = (await db.query('SELECT * FROM tasks ORDER BY id')).rows;
  await db.query('INSERT INTO projects VALUES ($1,$2,$3,$4,$5)', [id(12),'Same team',config,id(100),id(101)]);
  await db.query('INSERT INTO process_properties(id,project_id,name) VALUES($1,$2,$3),($4,$5,$3)', [prop,project,'Region',otherProp,otherProject]);
  await db.query('INSERT INTO process_property_options(id,project_id,property_id,label) VALUES($1,$2,$3,$4),($5,$6,$7,$4),($8,$2,$3,$9)', [option,project,prop,'Europe',otherOption,otherProject,otherProp,option2,'Türkiye']);
  await db.query('INSERT INTO action_property_values(task_id,project_id,property_id,option_id) VALUES($1,$2,$3,$4)', [task,project,prop,option]); checks++;
  await db.query("UPDATE process_properties SET name='Area' WHERE id=$1", [prop]);
  await db.query("UPDATE process_property_options SET label='Avrupa',color='blue' WHERE id=$1", [option]);
  const reread = (await db.query('SELECT * FROM action_property_values WHERE task_id=$1', [task])).rows[0];
  assert.equal(reread.property_id, prop); assert.equal(reread.option_id, option); checks++;
  await rejected('INSERT INTO action_property_values(task_id,project_id,property_id,option_id) VALUES($1,$2,$3,$4)', [otherTask,project,prop,option]);
  await rejected('INSERT INTO action_property_values(task_id,project_id,property_id,option_id) VALUES($1,$2,$3,$4)', [general,project,prop,option]);
  await rejected('UPDATE action_property_values SET option_id=$1 WHERE task_id=$2', [otherOption,task]);
  await rejected('UPDATE tasks SET project_id=$1 WHERE id=$2', [id(12),task]);
  await rejected('INSERT INTO process_property_options(project_id,property_id,label) VALUES($1,$2,$3)', [project,otherProp,'Foreign']);
  await rejected('UPDATE process_properties SET project_id=$1 WHERE id=$2', [otherProject,prop]);
  await rejected('UPDATE process_property_options SET id=$1 WHERE id=$2', [id(999),option]);
  await db.query('SELECT reorder_process_property_items($1,$2,$3)', [project,prop,[option2, option]]);
  assert.deepEqual((await db.query('SELECT id FROM process_property_options WHERE property_id=$1 ORDER BY position,id', [prop])).rows.map(o => o.id), [option2, option]); checks++;
  await rejected('SELECT reorder_process_property_items($1,$2,$3)', [project,prop,[option]]);
  await rejected('SELECT reorder_process_property_items($1,$2,$3)', [project,prop,[option,option]]);
  await rejected('SELECT reorder_process_property_items($1,$2,$3)', [project,prop,[option,otherOption]]);
  await db.query('UPDATE process_property_options SET archived_at=now() WHERE id=$1', [option]);
  assert.equal((await db.query('SELECT option_id FROM action_property_values WHERE task_id=$1', [task])).rows[0].option_id, option); checks++;
  await rejected('UPDATE action_property_values SET option_id=$1 WHERE task_id=$2', [option,task]);
  await db.query('UPDATE action_property_values SET option_id=$1 WHERE task_id=$2', [option2,task]);
  await db.query('UPDATE process_properties SET archived_at=now() WHERE id=$1', [prop]);
  await rejected('UPDATE action_property_values SET option_id=$1 WHERE task_id=$2', [option2,task]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM action_property_values')).rows[0].n, 1); checks++;
  assert.deepEqual((await db.query('SELECT * FROM tasks ORDER BY id')).rows, before); checks++;
  // Neither archive nor rename updates Action timestamps, Checklist JSON, Stage or rank.
  await db.exec('SET ROLE authenticated');
  await rejected('SELECT * FROM process_properties');
  await rejected('SELECT reorder_process_property_items($1,$2,$3)', [project,null,[prop]]);
  await db.exec('RESET ROLE; GRANT SELECT ON process_properties TO authenticated; SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM process_properties')).rows.length, 0); checks++;
  await db.exec('RESET ROLE; SET ROLE anon');
  await rejected('SELECT * FROM action_property_values');
  await db.exec('RESET ROLE');
  await db.query('DELETE FROM action_property_values WHERE task_id=$1 AND property_id=$2', [task,prop]);
  assert.equal((await db.query('SELECT * FROM action_property_values')).rows.length, 0); checks++;
  await db.query('INSERT INTO action_property_values(task_id,project_id,property_id,option_id) VALUES($1,$2,$3,$4)', [otherTask,otherProject,otherProp,otherOption]);
  await db.query('DELETE FROM projects WHERE id=$1', [otherProject]);
  assert.equal((await db.query('SELECT project_id FROM tasks WHERE id=$1', [otherTask])).rows[0].project_id, null);
  assert.equal((await db.query('SELECT * FROM action_property_values WHERE task_id=$1', [otherTask])).rows.length, 0); checks++;
  await db.close();
  console.log(`${checks} PostgreSQL property persistence, archive, ordering, scope and RLS checks passed.`);
}
main().catch(async error => { console.error(error); process.exitCode = 1; await database?.close(); });
