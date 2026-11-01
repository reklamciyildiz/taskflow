// Read-only inspection of the two billing migrations manually executed in Supabase SQL Editor.
// NEVER inserts a migration-history record or changes a customer subscription.
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
function abort(message) {
  console.error('Billing staging inspection refused: ' + message);
  process.exit(1);
}
const load = p => existsSync(p) ? parse(readFileSync(p)) : {};
const production = load('.env.local');
const stage = load('.env.staging.local');
const expected = stage.AXIOM_STAGING_SUPABASE_PROJECT_REF?.trim();
const host = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(stage.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1];
const prodRef = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(production.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1];
if (!expected || !host || expected !== host || !prodRef || prodRef === host) {
  abort('isolated staging and production Supabase project identities were not established');
}
const connection = stage.AXIOM_STAGING_DATABASE_URL?.trim();
let parsed;
try { parsed = new URL(connection); } catch { abort('staging database URL is missing or invalid'); }
const username = decodeURIComponent(parsed.username);
if (!(parsed.hostname.includes(expected) || username === 'postgres.' + expected || username.endsWith('.' + expected))) {
  abort('staging database connection does not match the staging project');
}

const client = new Client({ connectionString: connection });
const failures = [];
let checks = 0;
function check(label, passed) {
  checks++;
  if (!passed) {
    console.error('FAIL ' + label);
    failures.push(label);
  }
}
async function columns(table, names, options = {}) {
  const { rows } = await client.query(
    "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [table]
  );
  const found = new Map(rows.map(row => [row.column_name,row]));
  for (const name of names) check(table + '.' + name,found.has(name));
  if (options.notNull) for (const name of options.notNull) check(table + '.' + name + ' NOT NULL',found.get(name)?.is_nullable === 'NO');
}
async function constraint(table,name,parts) {
  const { rows } = await client.query(
    "SELECT pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class t ON k.conrelid=t.oid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=$1 AND k.conname=$2",
    [table,name]
  );
  const definition = rows[0]?.definition ?? '';
  check(table + '.' + name, !!definition && parts.every(s=>definition.includes(s)));
}
async function index(name, tokens) {
  const { rows } = await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1",[name]);
  const def = rows[0]?.indexdef ?? '';
  check(name,!!def && tokens.every(s=>def.includes(s)));
}
async function tableAccess(name) {
  const { rows } = await client.query(
    "SELECT c.relrowsecurity AS rls FROM pg_class c WHERE c.oid = to_regclass($1)",['public.' + name]
  );
  check(name + ' RLS',rows[0]?.rls === true);
  if (rows.length) {
    const q = await client.query(
      "SELECT has_table_privilege('anon',$1::regclass,'SELECT') AS anon_select, has_table_privilege('authenticated',$1::regclass,'SELECT') AS user_select, has_table_privilege('anon',$1::regclass,'INSERT') AS anon_insert, has_table_privilege('authenticated',$1::regclass,'INSERT') AS user_insert",
      ['public.' + name]
    );
    const grants = q.rows[0];
    check(name + ' server-only access', grants?.anon_select===false && grants?.user_select===false && grants?.anon_insert===false && grants?.user_insert===false);
  }
}
async function fn(signature,requiredBody = []) {
  const { rows } = await client.query(
    "SELECT p.prosecdef, pg_get_functiondef(p.oid) AS definition, has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec, has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_exec, has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec FROM pg_proc p WHERE p.oid=to_regprocedure($1)",[signature]
  );
  const f=rows[0];
  check(signature,!!f && f.prosecdef===true && f.anon_exec===false && f.user_exec===false && f.service_exec===true &&
    requiredBody.every(token => f.definition.includes(token)));
}
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await columns('organizations',[
    'ls_store_id','ls_product_id','subscription_ends_at','subscription_pause_mode',
    'subscription_test_mode','lemon_subscription_updated_at',
    'billing_provider','creem_customer_id','creem_subscription_id','creem_product_id',
    'creem_test_mode','creem_subscription_updated_at','creem_payment_hold'
  ],{notNull:['creem_payment_hold']});
  await columns('lemon_webhook_events',[
    'status','attempts','last_error','resource_id','resource_updated_at',
    'processing_started_at','processed_at','updated_at'
  ],{notNull:['status','attempts','updated_at']});
  await columns('creem_checkout_intents',[
    'request_id','organization_id','plan_name','units','test_mode','checkout_id','created_at','fulfilled_at'
  ],{notNull:['request_id','organization_id','plan_name','units','test_mode']});
  await columns('creem_webhook_events',[
    'event_id','payload_hash','event_type','status','attempts',
    'processing_started_at','last_error','received_at','completed_at'
  ],{notNull:['event_id','payload_hash','event_type','status','attempts']});
  await constraint('organizations','organizations_plan_name_check',["'individual'","'free'","'pro'","'team'"]);
  await constraint('organizations','organizations_billing_provider_check',["'lemon'","'creem'"]);
  await constraint('organizations','organizations_subscription_status_check',["'paused'","'expired'"]);
  await constraint('lemon_webhook_events','lemon_webhook_events_status_check',["'completed'","'failed'","'quarantined'"]);
  await constraint('creem_checkout_intents','creem_checkout_intents_plan_name_check',["'individual'","'pro'","'team'"]);
  await constraint('creem_checkout_intents','creem_checkout_intents_units_check',['500']);
  await constraint('creem_checkout_intents','creem_checkout_intents_organization_id_fkey',['organizations']);
  await constraint('creem_webhook_events','creem_webhook_events_status_check',["'processing'","'completed'","'failed'","'quarantined'"]);
  await index('uq_organizations_ls_subscription_id',['UNIQUE','ls_subscription_id']);
  await index('uq_organizations_creem_subscription_id',['UNIQUE','creem_subscription_id']);
  await index('idx_lemon_webhook_events_status_updated',['status','updated_at']);
  await index('idx_creem_checkout_intents_org',['organization_id','created_at']);
  await tableAccess('creem_checkout_intents');
  await tableAccess('creem_webhook_events');
  await fn('public.claim_lemon_webhook_event(text,text,text,timestamptz)',['FOR UPDATE','processing']);
  await fn('public.apply_lemon_subscription_snapshot(uuid,text,text,text,text,text,text,text,integer,timestamptz,text,boolean,timestamptz)',['lemon_subscription_updated_at']);
  await fn('public.claim_creem_event(text,text,text)',['FOR UPDATE','payload_hash']);
  await fn('public.apply_creem_subscription_snapshot(uuid,text,text,text,text,text,integer,timestamptz,boolean,timestamptz)',['creem_payment_hold','ls_subscription_id']);
  await fn('public.hold_creem_subscription(text,text)',['creem_payment_hold']);
  const versions = await client.query(
    "SELECT version,name FROM supabase_migrations.axiom_schema_migrations WHERE version IN ('20261025160000','20261101110000') ORDER BY version"
  );
  console.log('Billing migration history records: ' + (versions.rows.length ? versions.rows.map(x=>x.version).join(', ') : '(both missing)'));
  await client.query('COMMIT');
  console.log(JSON.stringify({stagingBillingInspection: failures.length ? 'failed' : 'passed', checks, failed: failures.length, databaseWrites: false}));
  if (failures.length) process.exitCode=1;
} catch(e) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Read-only staging billing inspection failed: ' + (e?.code ?? e?.message ?? 'unknown error'));
  process.exitCode=1;
} finally {
  await client.end().catch(()=>{});
}
