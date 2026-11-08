# Actiproc: Free / Individual / Pro / Team entitlement matrix

This document describes existing application behavior and production safety measures.
On 2026-11-08 the operator reported that the first (20261108120000) AND
atomic invitation follow-up (20261108160000) migrations were applied in
Production. Do not rerun them; verify their triggers and grants with the
read-only audit. No live payment or webhook settlement is proven by SQL Success.

Source of truth: lib/billing-plans.ts (prices and capacities),
lib/ai/ai-plan-catalog.ts (AI quotas),
lib/plan-entitlement-matrix.ts (public features and marketing copy),
lib/paid-feature-policy.ts (premium capabilities),
lib/entitlements.ts (subscription-aware effective limits).

## Pricing and dimensions

| Rule | Free | Individual | Pro | Team |
|---|---|---|---|---|
| Monthly price | $0 | unavailable | $4 / seat | $6 / seat |
| Annual price | $0 | $12 | $40 / seat | $60 / seat |
| Processes | 1 | 3 | 10 | Unlimited |
| Workspaces/Teams | 1 | 1 | 3 | Unlimited |
| Default seats (without purchased count) | 1 | 1 | 1 | 1 on paid subscription |
| Paid seats | — | purchased seats ($12/seat/year) | purchased seats | purchased seats |
| AI daily per user | 10 | 50 | 100 | 150 |
| AI monthly organization allowance | 30 | 300 | 800 per verified paid seat | 1200 per verified paid seat |

Per-seat AI-funded monthly allowance scales up to 20 verified seats.
AI burst protection is 12 requests/minute. There are no automatic AI
overage charges.

## Feature availability and enforcement

| Feature group | Free | Individual | Pro | Team | Existing control |
|---|---|---|---|---|---|
| Actions, tasks, checklists | yes | yes | yes | yes | scoped task API |
| Notes, drawings and Knowledge Hub | yes | yes | yes | yes | notes/knowledge ACL |
| PDF and other permitted attachments | yes | yes | yes | yes | attachment server access |
| Basic Planner / Inbox / Boards | yes | yes | yes | yes | scoped process/team ACL |
| Process custom properties | yes | yes | yes | yes | project/team ACL |
| AI assistant | low quota | medium quota | high quota | highest quota | atomic quota server |
| Reminder at due time | yes | yes | yes | yes | reminder policy |
| Advanced reminders | no | no | yes | yes | schedule-write API |
| Google Calendar OAuth and sync | no | no | yes | yes | OAuth and sync server |
| Basic team members/roles | seat-limited | seat-limited | seat-limited | seat-limited | membership API |
| Outgoing webhooks | no | no | no | yes | CRUD, dispatch, retry |
| Web and mobile clients | yes | yes | yes | yes | server plan access |

Do not claim that roles or assignments are exclusive Team features: the
existing source allows role-based collaboration on lower plans within seats.

## Security boundaries

- Frontend: marketing features are built from the shared catalog; a UI badge
  or local plan string does not grant entitlement.
- Backend: projects/workspaces check getPlanLimits; AI uses server-side atomic
  quota; paid reminders and Google sync use authenticated provider-aware
  checks; Team webhooks check every API/dispatch path.
- DB: RLS protects tenant data but service_role bypasses RLS. The operator reports 20261108120000 and 20261108160000 applied to
  Production (not independently verified). The latter replaces trigger bodies,
  uses one DB effective-plan calculator, and atomically accepts invitations.
  Both capacity and membership inserts serialize on an organization row lock.
  Existing excess capacity is preserved; only NEW inserts are restricted.
  The NEW 20261108210000 Free/Individual pricing migration is NOT yet applied.
  It must be applied before deploying this new seat-policy code.
- Creem: sandbox subscription IDs on Production do NOT count as paid.
  Suspended/unpaid/expired access falls back to Free; a cancelled subscription
  remains paid only until the verified end of its paid period.
- Existing processes and workspaces are never automatically deleted on
  expiration or downgrade. Newly attempted creations above Free capacity
  will be rejected after the DB trigger migration has been applied.

## Important product discrepancy

Free now offers 1 seat for new/extra membership; paid Individual is
$12/seat/year and uses verified Creem units (1–500). Existing Free accounts
with 2 or more seats are **grandfathered for existing content and membership**:
no users are removed; additional invitations are blocked until capacity is paid.
Individual AI monthly 300 requests is a shared ORGANIZATION allowance,
not multiplied by paid seats; disclose this commercially.

## Outstanding validation and non-atomic paths

1. Run npm run test:entitlements, npm run test:creem, npx tsc --noEmit and CI.
2. Production audit already located three historical Free over-limit
   organizations (two Process, one Workspace). Preserve all their records.
   Independently recheck installed triggers and RLS using the read-only audit
   scripts; the existing production audit showed zero policies on those
   two tables before the operator applied the first migration.
3. DO NOT rerun 20261108120000 merely because it is listed in git.
   Review and stage-test the ADDITIVE FOLLOW-UP
   supabase/migrations/20261108160000_actiproc_entitlement_invite_atomicity.sql.
   Apply it manually to Production BEFORE the new invitation API code is
   deployed. Verify installation using
   scripts/sql/actiproc-entitlements-after-atomicity-audit.sql.
   Git merge/deploy does not apply this migration.
4. Test Free 2nd process, Individual 4th process, Pro 11th process,
   Pro 4th workspace and simultaneous creates on an actual test organization.
5. Test Production Test Mode Creem subscription rejection and paid expiry.
6. Invitation acceptance is now designed to use a service-role-only
   transactional DB RPC; both OAuth onboarding and credentials registration
   call it. Do not mark it live-verified until the follow-up SQL is installed
   and parallel accept/replay/password-creation cases pass in staging.
   Missing RPC always FAILS CLOSED (503), not an unsafe old API fallback.
7. Database-level business rules for premium reminders, Google sync and
   webhook writes still rely on authenticated server flows + RLS restrictions.
   Full DB-level enforcement across EVERY product feature is not claimed.
8. Live Creem checkout and real customer charge require separate merchant
   approval and go-live acceptance. Keep CREEM_CHECKOUT_ENABLED=false.

Avoid updating any organization plan, test-mode flag or seat count by hand
to simulate a paid entitlement in the production database.


## Production follow-up rollout (2026-11-08)

Order matters: (a) CI/source checks, (b) staging migration and concurrency
tests, (c) ensure Production backup/PITR and verify the existing plan triggers,
(d) manually run ONLY the new 20261108160000 SQL (atomic transaction),
(e) run the read-only after-audit, (f) deploy new API code, (g) exercise invited
existing/new users and paid/free limits, and only then (h) consider enabling
pilot Creem live checkout.

**Do not deploy the new join/register endpoints before step (d):** they
require accept_actiproc_invitation RPC and intentionally return 503 without it.
Do not disable RLS or relax payment/checkout flags to bypass this gate.

Staging acceptance must verify:
- Two simultaneous valid invitations to a one-remaining-seat organization:
  exactly one accepts; loser creates NO user/team_members/accepted_at residue.
- Same invite token concurrently: exactly one succeeds; replay is rejected.
- An existing user in the organization can join another team without using
  an additional paid seat. Existing role is not silently downgraded.
- An invite to a different email, team outside the organization, expired
  or revoked token, or account tied to another org fails without data changes.
- Credentials registration writes password_hash in the SAME transaction.
  A registration attempting to reuse an existing (case-insensitive) email
  fails instead of modifying its password.
- Free/Individual/Pro capacity boundaries (and over-limit legacy records)
  reject NEW inserts but never delete existing content.
- Pending Pro-to-Team and Individual-to-Pro Creem plan changes DO NOT receive
  desired-plan DB caps until verified settlement.
- Pending seat increase, unpaid/past_due/expired, Test Mode in Production,
  cancelled paid period, legacy manual Team access, and wrong-org writes.
- Compare SQL effective cap vs API GET /api/entitlements/capabilities for
  each test account; investigate any inconsistency before pilot checkout.

**Commercial policy not silently changed:** Free currently permits 2 distinct
members, Individual 1. Decide future packaging/legacy policy separately.


## 2026-11-08 further pricing rollout (NOT live until deployed)

The new, separate, non-destructive migration is
`supabase/migrations/20261108210000_actiproc_free_individual_paid_seats.sql`.
After this migration is verified on disposable PostgreSQL CI and staging,
apply it to Production before deploying the updated API. It REPLACES
`actiproc_effective_plan_seats` and `reserve_creem_seat_change` functions
without changing subscriptions, existing organization seat_limit values,
memberships, users or projects. Confirm Free seat cap 1 and Individual
purchased cap in a new test organization (do not delete legacy members).
The checkout creates Creem transactions with `units` equal to the selected
paid seats, not a flat Individual amount for the entire organization.

CREEM_LIVE_CANARY_ORG_ID remains the deliberate single-org launch gate.
The observed second-account 503 was this audience gate, NOT a seat error.
Secret-mode Vercel variables cannot be read back but can be replaced. Do not
set CREEM_LIVE_PUBLIC_CHECKOUT_ENABLED=true until the pilot checkout is paid,
webhook signature accepted, purchased seats provisioned, downgrade/cancel
semantics checked and customer portal verified. Remove CANARY when opening
public (both flags together block everyone). Any environment-variable update
requires a new Production deployment.
