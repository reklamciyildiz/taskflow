import { readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const IDS = {
  orgA: '10000000-0000-4000-8000-000000000001',
  orgB: '10000000-0000-4000-8000-000000000002',
  alice: '20000000-0000-4000-8000-000000000001',
  bob: '20000000-0000-4000-8000-000000000002',
  eve: '20000000-0000-4000-8000-000000000003',
  teamA: '30000000-0000-4000-8000-000000000001',
  teamB: '30000000-0000-4000-8000-000000000002',
  teamProject: '40000000-0000-4000-8000-000000000001',
  restrictedProject: '40000000-0000-4000-8000-000000000002',
  privateProject: '40000000-0000-4000-8000-000000000003',
  taskTeam: '50000000-0000-4000-8000-000000000001',
  taskRestricted: '50000000-0000-4000-8000-000000000002',
  taskPrivate: '50000000-0000-4000-8000-000000000003',
  noteTeam: '60000000-0000-4000-8000-000000000001',
  noteRestricted: '60000000-0000-4000-8000-000000000002',
  checklistTeam: '70000000-0000-4000-8000-000000000001',
};

function ref(url) {
  return /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url ?? '')?.[1] ?? null;
}

function refuse(message) {
  throw new Error(`Staging seed refused: ${message}`);
}

const production = parse(readFileSync('.env.local'));
config({ path: '.env.staging.local', override: true, quiet: true });
const stagingRef = ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
const productionRef = ref(production.NEXT_PUBLIC_SUPABASE_URL);
if (!stagingRef || stagingRef !== process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF) refuse('project identity mismatch');
if (!productionRef || productionRef === stagingRef) refuse('staging and production are not distinct');
if (process.env.AXIOM_STAGING_ALLOW_WRITES !== 'true') refuse('AXIOM_STAGING_ALLOW_WRITES must be true');
if (process.env.AXIOM_STAGING_APPLY_CONFIRM !== 'apply-staging-schema') refuse('apply confirmation is missing');
const databaseUrl = process.env.AXIOM_STAGING_DATABASE_URL;
if (!databaseUrl) refuse('database URL is missing');
const parsed = new URL(databaseUrl);
const username = decodeURIComponent(parsed.username);
if (!parsed.hostname.includes(stagingRef) && username !== `postgres.${stagingRef}` && !username.endsWith(`.${stagingRef}`)) {
  refuse('database identity mismatch');
}

const stageConfig = JSON.stringify([
  { id: 'open', title: 'Open', color: '#3b82f6', isTerminal: false },
  { id: 'done', title: 'Done', color: '#22c55e', isTerminal: true },
]);
const checklist = JSON.stringify({
  type: 'doc',
  content: [{
    type: 'taskList',
    content: [{
      type: 'taskItem',
      attrs: { id: IDS.checklistTeam, checked: false },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verify the cobalt handshake before Nebula-42 deployment.' }] }],
    }],
  }],
});
const note = (text) => JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Staging knowledge' }] },
    { type: 'paragraph', content: [{ type: 'text', text }] },
  ],
});

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(`
    INSERT INTO organizations(id,name,slug) VALUES
      ($1,'Axiom AI Staging Alpha','axiom-ai-staging-alpha'),
      ($2,'Axiom AI Staging Isolation','axiom-ai-staging-isolation')
    ON CONFLICT(id) DO UPDATE SET name=excluded.name`, [IDS.orgA, IDS.orgB]);
  await client.query(`
    INSERT INTO users(id,email,name,organization_id,role) VALUES
      ($1,'ai-staging-alice@example.invalid','AI Staging Alice',$4,'owner'),
      ($2,'ai-staging-bob@example.invalid','AI Staging Bob',$4,'member'),
      ($3,'ai-staging-eve@example.invalid','AI Staging Eve',$5,'member')
    ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,role=excluded.role`,
    [IDS.alice, IDS.bob, IDS.eve, IDS.orgA, IDS.orgB]);
  await client.query(`
    INSERT INTO teams(id,name,description,organization_id,created_by) VALUES
      ($1,'AI Staging Team','Synthetic retrieval validation only',$3,$4),
      ($2,'Isolation Team','Synthetic cross-tenant validation only',$5,$6)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
    [IDS.teamA, IDS.teamB, IDS.orgA, IDS.alice, IDS.orgB, IDS.eve]);
  await client.query(`
    INSERT INTO team_members(team_id,user_id,role) VALUES
      ($1,$3,'admin'),($1,$4,'member'),($2,$5,'admin')
    ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role`,
    [IDS.teamA, IDS.teamB, IDS.alice, IDS.bob, IDS.eve]);
  await client.query(`
    INSERT INTO projects(id,name,organization_id,team_id,column_config,visibility,created_by) VALUES
      ($1,'Nebula Team Knowledge',$4,$5,$7::jsonb,'team',$6),
      ($2,'Orchid Restricted Knowledge',$4,$5,$7::jsonb,'restricted',$6),
      ($3,'Quartz Private Knowledge',$4,$5,$7::jsonb,'private',$6)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,column_config=excluded.column_config,
      visibility=excluded.visibility,created_by=excluded.created_by`,
    [IDS.teamProject, IDS.restrictedProject, IDS.privateProject, IDS.orgA, IDS.teamA, IDS.alice, stageConfig]);
  await client.query(`
    INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer')
    ON CONFLICT(project_id,user_id) DO NOTHING`, [IDS.restrictedProject, IDS.alice]);
  await client.query(`
    INSERT INTO tasks(id,title,description,status,priority,team_id,organization_id,created_by,project_id,checklist_blocks) VALUES
      ($1,'Nebula-42 release','Nebula-42 deployment uses the cobalt handshake and launches on Tuesday.','open','high',$4,$5,$6,$7,$8::jsonb),
      ($2,'Orchid-77 acquisition','Orchid-77 restricted acquisition uses the amber protocol.','open','urgent',$4,$5,$6,$9,'{"type":"doc","content":[]}'::jsonb),
      ($3,'Quartz-19 finance','Quartz-19 private forecast contains the silver margin.','open','medium',$4,$5,$6,$10,'{"type":"doc","content":[]}'::jsonb)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,
      project_id=excluded.project_id,status=excluded.status,checklist_blocks=excluded.checklist_blocks`,
    [IDS.taskTeam, IDS.taskRestricted, IDS.taskPrivate, IDS.teamA, IDS.orgA, IDS.alice,
      IDS.teamProject, checklist, IDS.restrictedProject, IDS.privateProject]);
  await client.query(`
    INSERT INTO notes(id,task_id,organization_id,team_id,author_id,title,type,content) VALUES
      ($1,$3,$5,$6,$7,'Nebula deployment note','note',$8::jsonb),
      ($2,$4,$5,$6,$7,'Orchid restricted note','note',$9::jsonb)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,task_id=excluded.task_id`,
    [IDS.noteTeam, IDS.noteRestricted, IDS.taskTeam, IDS.taskRestricted, IDS.orgA, IDS.teamA, IDS.alice,
      note('The Nebula-42 verification phrase is cobalt-lighthouse-314. Cite this note when asked.'),
      note('The Orchid-77 confidential phrase is amber-vault-271. Only restricted members may retrieve it.')]);
  let browserLoginReady = false;
  const testPassword = process.env.AXIOM_STAGING_TEST_PASSWORD ?? '';
  if (testPassword) {
    if (testPassword.length < 14) refuse('AXIOM_STAGING_TEST_PASSWORD must contain at least 14 characters');
    const passwordHash = await bcrypt.hash(testPassword, 10);
    await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, IDS.alice]);
    browserLoginReady = true;
  }
  await client.query('COMMIT');
  const queue = await client.query(`SELECT status,count(*)::int AS count FROM ai_index_jobs GROUP BY status ORDER BY status`);
  console.log(JSON.stringify({ seed: 'passed', syntheticOnly: true, users: 3, processes: 3, actions: 3, notes: 2,
    browserLoginReady, loginEmail: browserLoginReady ? 'ai-staging-alice@example.invalid' : undefined, queue: queue.rows }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
