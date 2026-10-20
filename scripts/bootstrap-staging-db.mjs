import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { config, parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--check') ? 'check' : 'plan';

function fail(message) {
  console.error(`Staging bootstrap refused: ${message}`);
  process.exit(1);
}

function readEnv(path) {
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

function projectRef(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url ?? '');
  return match?.[1] ?? null;
}

function loadSql(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) fail(`missing migration source: ${path}`);
  return readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '');
}

function withoutOuterTransaction(sql) {
  const lines = sql.split(/\r?\n/);
  const beginIndex = lines.findIndex((line) => line.trim().toUpperCase() === 'BEGIN;');
  let commitIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim().toUpperCase() === 'COMMIT;') {
      commitIndex = index;
      break;
    }
  }
  if (beginIndex >= 0 && commitIndex > beginIndex) {
    lines.splice(commitIndex, 1);
    lines.splice(beginIndex, 1);
  }
  return lines.join('\n');
}

const migrationSources = [
  ['20200101000000', 'initial_axiom_schema', ['supabase/schema.sql', 'supabase/migrations/00_missing_tables.sql']],
  ['20240107000000', 'make_organization_id_nullable', ['supabase/migrations/20240107_make_organization_id_nullable.sql']],
  ['20240109000000', 'add_customers_table', ['supabase/migrations/20240109_add_customers_table.sql']],
  ['20260113000000', 'webhooks', ['supabase/migrations/20260113_webhooks.sql']],
  ['20260113000100', 'webhooks_disable_rls', ['supabase/migrations/20260113_webhooks_disable_rls.sql']],
  ['20260113000200', 'webhooks_fix_rls', ['supabase/migrations/20260113_webhooks_fix_rls.sql']],
  ['20260114000000', 'enable_rls_all_tables', ['supabase/migrations/20260114_enable_rls_all_tables.sql']],
  ['20260117000000', 'ai_features', ['supabase/migrations/20260117000000_ai_features.sql']],
  ['20260330120000', 'projects_pipeline_tasks', ['supabase/migrations/20260330120000_projects_pipeline_tasks.sql']],
  ['20260330120001', 'task_status_drop_enum', ['supabase/migrations/20260330120001_task_status_drop_enum_after_default.sql']],
  ['20260406120000', 'tasks_board_position', ['supabase/migrations/20260406120000_tasks_board_position.sql']],
  ['20260415180000', 'push_subscriptions', ['supabase/migrations/20260415180000_push_subscriptions.sql']],
  ['20260416110000', 'create_user_settings', ['supabase/migrations/20260416110000_create_user_settings.sql']],
  ['20260416120000', 'google_calendar', ['supabase/migrations/20260416120000_google_calendar.sql']],
  ['20260418120000', 'project_visibility_acl', ['supabase/migrations/20260418120000_project_visibility_acl.sql']],
  ['20260421090000', 'task_reminders', ['supabase/migrations/20260421090000_task_reminders.sql']],
  ['20260422130000', 'lemon_billing_org_fields', ['supabase/migrations/20260422130000_lemon_billing_org_fields.sql']],
  ['20260422133000', 'lemon_billing_seats_events', ['supabase/migrations/20260422133000_lemon_billing_seats_and_events.sql']],
  ['20260427010100', 'password_hash', ['supabase/migrations/20260427010100_add_password_hash_to_users.sql']],
  ['20260504120000', 'notifications_unique_link', ['supabase/migrations/20260504120000_notifications_unique_user_type_link.sql']],
  ['20260520000000', 'fix_missing_rls', ['supabase/migrations/20260520000000_fix_missing_rls.sql']],
  ['20260520100000', 'cleanup_test_subscriptions', ['supabase/migrations/20260520100000_cleanup_test_subscriptions.sql']],
  ['20260910114000', 'block_editor_columns', ['supabase/migrations/20260910114000_block_editor_columns.sql']],
  ['20261007120000', 'action_notes', ['supabase/migrations/20261007120000_action_notes.sql']],
  ['20261007180000', 'migrate_legacy_learnings', ['supabase/migrations/20261007180000_migrate_legacy_learnings_to_notes.sql']],
  ['20261008110000', 'reconcile_legacy_journal', ['supabase/migrations/20261008110000_reconcile_legacy_journal_to_checklist_blocks.sql']],
  ['20261008120000', 'drop_legacy_task_content', ['supabase/migrations/20261008120000_drop_legacy_task_content_columns.sql']],
  ['20261009120000', 'stable_checklist_ids', ['supabase/migrations/20261009120000_stabilize_checklist_item_ids.sql']],
  ['20261009121000', 'work_scheduling', ['supabase/migrations/20261009121000_work_scheduling_foundation.sql']],
  ['20261009130000', 'legacy_scheduling_lifecycle', ['supabase/migrations/20261009130000_migrate_legacy_scheduling_and_lifecycle.sql']],
  ['20261009140000', 'occurrence_date_collisions', ['supabase/migrations/20261009140000_prevent_occurrence_effective_date_collisions.sql']],
  ['20261010120000', 'stage_identity_guards', ['supabase/migrations/20261010120000_stage_identity_guards.sql']],
  ['20261011120000', 'process_single_select', ['supabase/migrations/20261011120000_process_single_select_properties.sql']],
  ['20261012120000', 'private_attachments', ['supabase/migrations/20261012120000_private_attachments.sql']],
  ['20261017120000', 'workspace_preferences', ['supabase/migrations/20261017120000_user_workspace_preferences.sql']],
  ['20261017130000', 'action_panel_preferences', ['supabase/migrations/20261017130000_user_action_panel_preferences.sql']],
  ['20261017140000', 'ai_foundation_hardening', ['supabase/migrations/20261017140000_ai_foundation_hardening.sql']],
  ['20261017160000', 'ai_rag_index_foundation', ['supabase/migrations/20261017160000_ai_rag_index_foundation.sql']],
  ['20261017170000', 'ai_hybrid_retrieval', ['supabase/migrations/20261017170000_ai_hybrid_retrieval.sql']],
  ['20261017180000', 'ai_chat_conversations', ['supabase/migrations/20261017180000_ai_chat_conversations.sql']],
  ['20261017190000', 'ai_production_readiness', ['supabase/migrations/20261017190000_ai_production_readiness_hardening.sql']],
  ['20261017200000', 'service_role_runtime_grants', ['supabase/migrations/20261017200000_service_role_runtime_grants.sql']],
  ['20261017210000', 'ai_beta_index_claim_scope', ['supabase/migrations/20261017210000_ai_beta_index_claim_scope.sql']],
  ['20261017220000', 'ai_targeted_note_index_claim', ['supabase/migrations/20261017220000_ai_targeted_note_index_claim.sql']],
  ['20261018190000', 'ai_read_tool_references', ['supabase/migrations/20261018190000_ai_read_tool_references.sql']],
  ['20261018191000', 'ai_read_tool_combined_acl', ['supabase/migrations/20261018191000_ai_read_tool_combined_acl.sql']],
  ['20261018200000', 'ai_write_tool_proposals', ['supabase/migrations/20261018200000_ai_write_tool_proposals.sql']],
  ['20261018201000', 'ai_write_tool_audit_atomicity', ['supabase/migrations/20261018201000_ai_write_tool_audit_atomicity.sql']],
  ['20261019120000', 'ai_action_mutation_tools', ['supabase/migrations/20261019120000_ai_action_mutation_tools.sql']],
  ['20261020210000', 'planner_time_block_duration', ['supabase/migrations/20261020210000_planner_time_block_duration.sql']],
];

// The historical baseline helper already creates this trigger, while the later
// canonical webhook migration recreates it with its final implementation.
// Keep both source files untouched and make only the staging bootstrap replay
// idempotent at that known boundary.
const replayCompatibilityPreambles = new Map([
  ['20260113000000', 'DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;'],
  [
    '20260114000000',
    'DROP POLICY IF EXISTS "Users can view customers in their organization" ON customers;',
  ],
]);

const seen = new Set();
const migrations = migrationSources.map(([version, name, paths]) => {
  if (seen.has(version)) fail(`duplicate normalized migration version: ${version}`);
  seen.add(version);
  const sources = paths.map((path) => `-- source: ${path}\n${loadSql(path)}`).join('\n\n');
  const preamble = replayCompatibilityPreambles.get(version);
  const original = preamble ? `-- staging replay compatibility\n${preamble}\n\n${sources}` : sources;
  return {
    version,
    name,
    sql: withoutOuterTransaction(original),
    checksum: createHash('sha256').update(original).digest('hex'),
  };
});

const forbidden = /\b(CREATE|DROP)\s+DATABASE\b|\bVACUUM\b|\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i;
for (const migration of migrations) {
  if (forbidden.test(migration.sql)) fail(`unsupported non-transactional SQL in ${migration.name}`);
}

const manifestHash = createHash('sha256')
  .update(migrations.map((item) => `${item.version}:${item.checksum}`).join('\n'))
  .digest('hex');

console.log(JSON.stringify({
  mode,
  migrations: migrations.length,
  firstVersion: migrations[0].version,
  lastVersion: migrations.at(-1).version,
  manifestHash,
  databaseConnected: false,
  writesPerformed: false,
}));

if (mode === 'plan') process.exit(0);

const productionEnv = readEnv('.env.local');
const stagingResult = config({ path: '.env.staging.local', override: true, quiet: true });
if (stagingResult.error) fail('.env.staging.local could not be loaded');

const expectedRef = process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF?.trim();
const stagingRef = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
const productionRef = projectRef(productionEnv.NEXT_PUBLIC_SUPABASE_URL);
if (!expectedRef || !stagingRef || expectedRef !== stagingRef) fail('staging project identity mismatch');
if (!productionRef || productionRef === stagingRef) fail('staging and production projects are not distinct');

const databaseUrl = process.env.AXIOM_STAGING_DATABASE_URL?.trim();
if (!databaseUrl) fail('AXIOM_STAGING_DATABASE_URL is required for remote check/apply');
let parsedDatabaseUrl;
try { parsedDatabaseUrl = new URL(databaseUrl); } catch { fail('staging database URL is invalid'); }
const username = decodeURIComponent(parsedDatabaseUrl.username);
const dbIdentityMatches = parsedDatabaseUrl.hostname.includes(expectedRef)
  || username === `postgres.${expectedRef}`
  || username.endsWith(`.${expectedRef}`);
if (!dbIdentityMatches) fail('database connection identity does not match the staging project');

if (mode === 'apply') {
  if (process.env.AXIOM_STAGING_ALLOW_WRITES !== 'true') fail('AXIOM_STAGING_ALLOW_WRITES must be true');
  if (process.env.AXIOM_STAGING_APPLY_CONFIRM !== 'apply-staging-schema') {
    fail('AXIOM_STAGING_APPLY_CONFIRM must equal apply-staging-schema');
  }
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const state = await client.query(`
    SELECT
      to_regclass('supabase_migrations.axiom_schema_migrations') IS NOT NULL AS tracking_exists,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND c.relname IN ('organizations','users','teams','tasks','projects','notes','attachments')
      ) AS canonical_schema_exists
  `);
  const trackingExists = state.rows[0]?.tracking_exists === true;
  const canonicalSchemaExists = state.rows[0]?.canonical_schema_exists === true;

  let applied = [];
  if (trackingExists) {
    const result = await client.query(
      'SELECT version,name,checksum FROM supabase_migrations.axiom_schema_migrations ORDER BY version',
    );
    applied = result.rows;
  }
  if (!trackingExists && canonicalSchemaExists) {
    fail('canonical tables exist without Axiom staging migration history; refusing a conflicting bootstrap');
  }
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  for (const migration of migrations) {
    const previous = appliedByVersion.get(migration.version);
    if (previous && (previous.name !== migration.name || previous.checksum !== migration.checksum)) {
      fail(`migration drift detected at ${migration.version}`);
    }
  }
  const pending = migrations.filter((migration) => !appliedByVersion.has(migration.version));

  if (mode === 'check') {
    console.log(JSON.stringify({
      remoteCheck: 'passed',
      trackingExists,
      canonicalSchemaExists,
      applied: applied.length,
      pending: pending.length,
      writesPerformed: false,
    }));
    process.exit(0);
  }

  await client.query('BEGIN');
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
    await client.query(`
      CREATE TABLE IF NOT EXISTS supabase_migrations.axiom_schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  for (const migration of pending) {
    process.stdout.write(`Applying ${migration.version} ${migration.name}... `);
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO supabase_migrations.axiom_schema_migrations(version,name,checksum)
         VALUES($1,$2,$3)`,
        [migration.version, migration.name, migration.checksum],
      );
      await client.query('COMMIT');
      console.log('ok');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${migration.version} failed`, { cause: error });
    }
  }

  const validation = await client.query(`
    SELECT
      (SELECT count(*)::int FROM supabase_migrations.axiom_schema_migrations) AS applied,
      (SELECT count(*)::int FROM pg_extension WHERE extname IN ('vector','pgcrypto')) AS ai_extensions,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname IN (
         'organizations','users','teams','projects','tasks','notes','attachments',
         'ai_source_documents','ai_chunks','ai_index_jobs','ai_conversations','ai_messages'
       )) AS required_relations
  `);
  const row = validation.rows[0];
  if (row.applied !== migrations.length || row.ai_extensions !== 2 || row.required_relations !== 12) {
    fail('post-migration structural validation failed');
  }
  console.log(JSON.stringify({
    apply: 'passed',
    applied: row.applied,
    aiExtensions: row.ai_extensions,
    requiredRelations: row.required_relations,
    writesPerformed: true,
  }));
} catch (error) {
  const code = error?.cause?.code ?? error?.code ?? 'unknown';
  console.error(`Staging database operation failed (${code}). No secret values were logged.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
