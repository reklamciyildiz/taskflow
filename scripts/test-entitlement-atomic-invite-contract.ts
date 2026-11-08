/**
 * Source-level regression contracts: NOT a substitute for a transactional
 * staging test against PostgreSQL. No real user, payment or DB is mutated.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const sql = read('supabase/migrations/20261108160000_actiproc_entitlement_invite_atomicity.sql');
const oldSql = read('supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql');
const rpc = read('lib/invitation-acceptance.ts');
const join = read('app/api/onboarding/join-organization/route.ts');
const db = read('lib/db.ts');
const reg = read('app/api/auth/register/route.ts');

const checks: Record<string, boolean> = {
  'preserve already-applied migration': oldSql.includes('trg_actiproc_projects_plan_limit')
    && oldSql.includes('trg_actiproc_teams_plan_limit'),
  'additive follow-up SQL': sql.includes('CREATE OR REPLACE FUNCTION public.actiproc_enforce_entity_plan_limit()')
    && !/\bDELETE\s+FROM\s+public\./i.test(sql)
    && !/\bTRUNCATE\b|\bDROP\s+TABLE\b/i.test(sql),
  'single effective SQL policy': sql.includes('CREATE OR REPLACE FUNCTION public.actiproc_effective_plan_seats')
    && sql.includes('FROM public.actiproc_effective_plan_seats(v_org)'),
  'unverified Creem plan is not granted': sql.includes("pc.status IN ('pending', 'awaiting_sync', 'review')")
    && sql.includes('pc.desired_plan = v_plan') && sql.includes('v_plan := v_previous_plan'),
  'sandbox paid access denied': sql.includes('p_org.creem_test_mode IS DISTINCT FROM FALSE'),
  'Creem hold and period end checked': sql.includes('p_org.creem_payment_hold')
    && sql.includes('p_org.subscription_ends_at > CURRENT_TIMESTAMP'),
  'DB capacities are atomic': sql.includes('WHERE id = NEW.organization_id FOR NO KEY UPDATE')
    && sql.includes("TG_TABLE_NAME = 'projects'"),
  'member guard includes all plan tiers': sql.includes('CREATE OR REPLACE FUNCTION public.guard_creem_team_member_seat()')
    && sql.includes('CREATE TRIGGER trg_guard_creem_team_member_seat')
    && sql.includes('COUNT(DISTINCT tm.user_id)'),
  'manual developer Team policy preserved': sql.includes('THEN NULL -- Preserve existing manual/developer Team unlimited seats'),
  'pending seat increases are not provisioned': sql.includes('MIN(sc.previous_seats)')
    && sql.includes('sc.desired_seats > sc.previous_seats'),
  'atomic SQL covers all five operations': sql.includes('CREATE OR REPLACE FUNCTION public.accept_actiproc_invitation(')
    && sql.includes('FOR UPDATE;')
    && sql.includes('INSERT INTO public.users')
    && sql.includes('INSERT INTO public.team_members')
    && sql.includes('UPDATE public.invitations SET accepted_at'),
  'invitation email is server-proven': sql.includes('ACTIPROC_INVITE_EMAIL_MISMATCH')
    && join.includes('email: session.user.email'),
  'invitation cannot be reused': sql.includes('v_inv.accepted_at IS NOT NULL')
    && sql.includes('v_inv.expires_at <= CURRENT_TIMESTAMP'),
  'wrong organization and team fail closed': sql.includes('ACTIPROC_USER_OTHER_ORG')
    && sql.includes('ACTIPROC_INVITE_TEAM_INVALID'),
  'single seat reservation per org': sql.includes('WHERE id = v_inv.organization_id FOR NO KEY UPDATE')
    && sql.includes('IF v_used >= v_seat_limit THEN'),
  'SQL RPC is service-role only': sql.includes('REVOKE ALL ON FUNCTION public.accept_actiproc_invitation(text,text,text,text,text)')
    && sql.includes('TO service_role;'),
  'existing member does not overwrite roles': sql.includes('ON CONFLICT DO NOTHING'),
  'onboarding never check-then-inserts': join.includes('acceptInvitationAtomic(')
    && !join.includes('userDb.create(') && !join.includes('teamMemberDb.add(')
    && !join.includes('invitationDb.accept('),
  'legacy credential join routes through same RPC': db.includes('export async function joinOrganizationViaInvitation(')
    && db.includes('acceptInvitationAtomic({')
    && !db.substring(db.indexOf('export async function joinOrganizationViaInvitation(')).includes('userDb.create('),
  'credential hash is atomic': reg.includes('await bcrypt.hash(password, 10)')
    && reg.includes('invitationToken, passwordHash')
    && sql.includes('p_password_hash text DEFAULT NULL')
    && sql.includes('password_hash)'),
  'API fails closed if SQL unavailable': rpc.includes('INVITE_UNAVAILABLE')
    && rpc.includes("rpc('accept_actiproc_invitation'"),
  'API redacts sensitive user columns': join.includes('user: {') && !join.includes('user: user,'),
};

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, name);
}
console.log('Actiproc atomic invitation/entitlement: ' +
  Object.keys(checks).length + ' source security contracts passed.');
