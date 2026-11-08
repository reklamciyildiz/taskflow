/* Disposable PostgreSQL E2E. NEVER run against a customer database. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.TEST_DATABASE_URL ||
    !/localhost|127\.0\.0\.1/.test(process.env.TEST_DATABASE_URL)) {
  throw new Error('TEST_DATABASE_URL must be a disposable localhost Postgres database');
}
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 14 });

const schema = [
  "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
  "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
  "DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
  "DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
  "CREATE TYPE public.user_role AS ENUM ('owner','admin','member');",
  "CREATE TYPE public.team_role AS ENUM ('admin','member','viewer');",
  "CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_name text NOT NULL DEFAULT 'free', subscription_status text DEFAULT 'active', subscription_ends_at timestamptz, billing_provider text, creem_subscription_id text, ls_subscription_id text, creem_test_mode boolean, creem_payment_hold boolean DEFAULT false, seat_limit integer);",
  "CREATE TABLE public.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL, avatar_url text, organization_id uuid REFERENCES public.organizations(id), role public.user_role DEFAULT 'member', password_hash text, created_at timestamptz DEFAULT now());",
  "CREATE TABLE public.teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, organization_id uuid NOT NULL REFERENCES public.organizations(id), created_by uuid REFERENCES public.users(id), created_at timestamptz DEFAULT now());",
  "CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id));",
  "CREATE TABLE public.team_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES public.teams(id), user_id uuid NOT NULL REFERENCES public.users(id), role public.team_role DEFAULT 'member', UNIQUE(team_id,user_id));",
  "CREATE TABLE public.invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id), team_id uuid REFERENCES public.teams(id), role public.team_role DEFAULT 'member', invited_by uuid REFERENCES public.users(id), token text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, accepted_at timestamptz, created_at timestamptz DEFAULT now());",
  "CREATE TABLE public.creem_plan_changes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES public.organizations(id), previous_plan text, desired_plan text, status text);",
  "CREATE TABLE public.creem_seat_changes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES public.organizations(id), subscription_id text, previous_seats integer, desired_seats integer, test_mode boolean, previous_transaction_id text, status text DEFAULT 'pending');",
].join('\n');

async function createOrg(plan = 'free', opts = {}) {
  const paid = Boolean(opts.creem);
  const org = (await db.query(
    "INSERT INTO public.organizations(plan_name,subscription_status,billing_provider,creem_subscription_id,creem_test_mode,creem_payment_hold,seat_limit) VALUES($1,'active',$2,$3,$4,false,$5) RETURNING id",
    [plan, paid ? 'creem' : null, paid ? 'sub_' + randomUUID() : null,
      paid ? Boolean(opts.testMode) : null, opts.seats ?? 1],
  )).rows[0].id;
  const owner = (await db.query(
    "INSERT INTO public.users(email,name,organization_id,role) VALUES($1,'Owner',$2,'owner') RETURNING id",
    ['owner-' + randomUUID() + '@test.invalid', org],
  )).rows[0].id;
  const team = (await db.query(
    "INSERT INTO public.teams(name,organization_id,created_by) VALUES('General',$1,$2) RETURNING id",
    [org, owner],
  )).rows[0].id;
  await db.query("INSERT INTO public.team_members(team_id,user_id,role) VALUES($1,$2,'admin')", [team, owner]);
  return { org, owner, team };
}
async function invite(fixture, email, teamId = fixture.team) {
  const token = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
  await db.query(
    "INSERT INTO public.invitations(email,organization_id,team_id,role,invited_by,token,expires_at) VALUES($1,$2,$3,'member',$4,$5,now()+interval '1 day')",
    [email, fixture.org, teamId, fixture.owner, token],
  );
  return token;
}
function accept(token, email, passwordHash = null) {
  return db.query("SELECT * FROM public.accept_actiproc_invitation($1,$2,$3,$4,$5)",
    [token, email, 'Test User', null, passwordHash]);
}
async function fails(promise, pattern) {
  await assert.rejects(promise, e => {
    assert.match(String(e.message), new RegExp(pattern));
    return true;
  });
}
async function count(table, column, value) {
  const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM public." + table +
    " WHERE " + column + " = $1", [value]);
  return rows[0].n;
}
function createProcess(org) {
  return db.query("INSERT INTO public.projects(organization_id) VALUES ($1)", [org]);
}
function team(org, owner) {
  return db.query("INSERT INTO public.teams(name,organization_id,created_by) VALUES('Other',$1,$2) RETURNING id", [org, owner]);
}
async function run() {
  await db.query(schema);
  await db.query(readFileSync('supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql', 'utf8'));
  await db.query(readFileSync('supabase/migrations/20261108160000_actiproc_entitlement_invite_atomicity.sql', 'utf8'));
  // Disposable schema represents the pre-existing production reservation RPC;
  // the new migration replaces it with the actual Individual-enabled version.
  await db.query("CREATE FUNCTION public.reserve_creem_seat_change(uuid,text,integer,integer,boolean,text) RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'");
  await db.query(readFileSync('supabase/migrations/20261108210000_actiproc_free_individual_paid_seats.sql', 'utf8'));

  const perms = await db.query(
    "SELECT has_function_privilege('anon','public.accept_actiproc_invitation(text,text,text,text,text)','EXECUTE') AS anon, has_function_privilege('authenticated','public.accept_actiproc_invitation(text,text,text,text,text)','EXECUTE') AS authed");
  assert.equal(perms.rows[0].anon, false);
  assert.equal(perms.rows[0].authed, false);

  // The paid Pro fixture has one remaining purchased seat. Two simultaneous
  // invites cannot both consume it under the organization lock.
  const f = await createOrg('pro', { creem:true, seats:2 });
  const one = await invite(f, 'one@example.org');
  const two = await invite(f, 'two@example.org');
  const races = await Promise.allSettled([
    accept(one, 'one@example.org'), accept(two, 'two@example.org'),
  ]);
  assert.equal(races.filter(r => r.status === 'fulfilled').length, 1,
    'Paid org with 1 remaining seat must accept only 1 concurrent invite');
  assert.match(String(races.find(r => r.status === 'rejected').reason.message), /ACTIPROC_SEAT_LIMIT/);
  assert.equal(await count('users', 'organization_id', f.org), 2);
  const loser = races[0].status === 'rejected' ? 'one@example.org' : 'two@example.org';
  const winnerToken = races[0].status === 'fulfilled' ? one : two;
  const winnerEmail = races[0].status === 'fulfilled' ? 'one@example.org' : 'two@example.org';
  assert.equal(await count('users', 'email', loser), 0, 'Failed invite must create no orphan user');
  await fails(accept(winnerToken, winnerEmail), 'ACTIPROC_INVITE_INVALID');

  const wrong = await createOrg('individual', { creem:true, seats:2 });
  const wrongToken = await invite(wrong, 'correct@example.org');
  await fails(accept(wrongToken, 'wrong@example.org'), 'ACTIPROC_INVITE_EMAIL_MISMATCH');
  const invited = await db.query("SELECT accepted_at FROM public.invitations WHERE token=$1", [wrongToken]);
  assert.equal(invited.rows[0].accepted_at, null);
  const hash = await bcrypt.hash('strong-pass-123', 10);
  await accept(wrongToken, 'CORRECT@EXAMPLE.ORG', hash);
  const stored = (await db.query("SELECT password_hash FROM public.users WHERE email=$1",
    ['correct@example.org'])).rows[0].password_hash;
  assert.equal(await bcrypt.compare('strong-pass-123', stored), true);
  const duplicate = await invite(wrong, 'CORRECT@EXAMPLE.ORG');
  await fails(accept(duplicate, 'correct@example.org', hash), 'ACTIPROC_USER_ALREADY_EXISTS');

  const cross = await createOrg('pro', { seats: 2 });
  const crossInvite = await invite(cross, 'correct@example.org');
  await fails(accept(crossInvite, 'correct@example.org'), 'ACTIPROC_USER_OTHER_ORG');

  const pro = await createOrg('pro', { seats: 2 });
  const secondTeam = (await team(pro.org, pro.owner)).rows[0].id;
  const ownerEmail = (await db.query("SELECT email FROM public.users WHERE id=$1", [pro.owner])).rows[0].email;
  const existingInvite = await invite(pro, ownerEmail, secondTeam);
  const existingAccepted = await accept(existingInvite, ownerEmail);
  assert.equal(existingAccepted.rows[0].already_member, true);
  assert.equal(await count('team_members', 'user_id', pro.owner), 2);
  await team(pro.org, pro.owner);
  await fails(team(pro.org, pro.owner), 'ACTIPROC_PLAN_LIMIT');
  for (let i = 0; i < 10; i++) await createProcess(pro.org);
  await fails(createProcess(pro.org), 'ACTIPROC_PLAN_LIMIT');

  const free = await createOrg('free');
  const freeInvite = await invite(free,'free-new@example.org');
  await fails(accept(freeInvite,'free-new@example.org'),'ACTIPROC_SEAT_LIMIT');
  await createProcess(free.org);
  await fails(createProcess(free.org), 'ACTIPROC_PLAN_LIMIT');
  await fails(team(free.org, free.owner), 'ACTIPROC_PLAN_LIMIT');

  const individual = await createOrg('individual');
  for (let i = 0; i < 3; i++) await createProcess(individual.org);
  await fails(createProcess(individual.org), 'ACTIPROC_PLAN_LIMIT');

  // Individual purchases a variable number of annually billed seats.
  const annual = await createOrg('individual', { creem:true, seats:3 });
  const annualOne = await invite(annual, 'annual-one@example.org');
  const annualTwo = await invite(annual, 'annual-two@example.org');
  await accept(annualOne, 'annual-one@example.org');
  await accept(annualTwo, 'annual-two@example.org');
  await fails(accept(await invite(annual, 'annual-extra@example.org'), 'annual-extra@example.org'), 'ACTIPROC_SEAT_LIMIT');
  const subId = (await db.query('SELECT creem_subscription_id FROM public.organizations WHERE id=$1',[annual.org])).rows[0].creem_subscription_id;
  const reservation = await db.query('SELECT public.reserve_creem_seat_change($1,$2,3,4,false,$3) AS id',[annual.org,subId,'tran_baseline']);
  assert.ok(reservation.rows[0].id, 'Individual paid seat changes must be reservable');
  const pendingExtra = await invite(annual, 'annual-extra@example.org');
  await fails(accept(pendingExtra,'annual-extra@example.org'),'ACTIPROC_SEAT_LIMIT');
  // Creem must confirm a paid quantity increase before the extra seat unlocks.
  await db.query('UPDATE public.organizations SET seat_limit=4 WHERE id=$1',[annual.org]);
  await fails(accept(pendingExtra,'annual-extra@example.org'),'ACTIPROC_SEAT_LIMIT');
  await db.query("UPDATE public.creem_seat_changes SET status='confirmed' WHERE organization_id=$1",[annual.org]);
  await accept(pendingExtra,'annual-extra@example.org');

  const manualTeam = await createOrg('team', { seats: 1 });
  for (let i = 0; i < 12; i++) await createProcess(manualTeam.org);
  for (let i = 0; i < 5; i++) await team(manualTeam.org, manualTeam.owner);
  const manualInvite = await invite(manualTeam, 'manual@example.org');
  await accept(manualInvite, 'manual@example.org'); // Preserve manual Team unlimited rule.

  const changing = await createOrg('team', { creem: true, seats: 2 });
  await db.query("INSERT INTO public.creem_plan_changes(organization_id,previous_plan,desired_plan,status) VALUES($1,'pro','team','pending')", [changing.org]);
  for (let i = 0; i < 10; i++) await createProcess(changing.org);
  await fails(createProcess(changing.org), 'ACTIPROC_PLAN_LIMIT');
  await team(changing.org, changing.owner);
  await team(changing.org, changing.owner);
  await fails(team(changing.org, changing.owner), 'ACTIPROC_PLAN_LIMIT');
  await db.query("UPDATE public.creem_plan_changes SET status='confirmed' WHERE organization_id=$1", [changing.org]);
  await createProcess(changing.org);
  await team(changing.org, changing.owner);

  const seats = await createOrg('pro', { creem: true, seats: 3 });
  const seatInvite = await invite(seats, 'seat@example.org');
  await db.query("INSERT INTO public.creem_seat_changes(organization_id,previous_seats,desired_seats,status) VALUES($1,1,3,'pending')", [seats.org]);
  await fails(accept(seatInvite, 'seat@example.org'), 'ACTIPROC_SEAT_LIMIT');
  assert.equal(await count('users', 'email', 'seat@example.org'), 0);
  await db.query("UPDATE public.creem_seat_changes SET status='confirmed' WHERE organization_id=$1", [seats.org]);
  await accept(seatInvite, 'seat@example.org');

  const sandbox = await createOrg('pro', { creem: true, testMode: true });
  await createProcess(sandbox.org);
  await fails(createProcess(sandbox.org), 'ACTIPROC_PLAN_LIMIT');

  // Preserve existing over-cap rows; disallow additions after downgrade.
  await db.query('ALTER TABLE public.projects DISABLE TRIGGER trg_actiproc_projects_plan_limit');
  await createProcess(free.org);
  await db.query('ALTER TABLE public.projects ENABLE TRIGGER trg_actiproc_projects_plan_limit');
  assert.equal(await count('projects', 'organization_id', free.org), 2);
  await fails(createProcess(free.org), 'ACTIPROC_PLAN_LIMIT');
  assert.equal(await count('projects', 'organization_id', free.org), 2);
  console.log('Postgres E2E passed: 2 concurrent invites, replay, tenant, password, seat, plan, sandbox, legacy caps');
}
run().catch(e => {
  console.error('SQL integration test failed:', e);
  process.exitCode = 1;
}).finally(() => db.end());
