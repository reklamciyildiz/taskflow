# Actiproc: Free / Individual / Pro / Team entitlement matrix

This document describes existing application behavior and the newly added
production safety measures. It is not a claim that live customer payment tests
or production SQL migration have completed.

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
| Default seats (without purchased count) | 2 | 1 | 1 | 1 on paid subscription |
| Paid seats | — | 1 | purchased seats | purchased seats |
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
- DB: RLS protects tenant data but service_role bypasses RLS. A separate,
  additive SQL migration installs BEFORE INSERT capacity triggers for teams
  and projects, with an organization row lock to serialize concurrent creates.
- Creem: sandbox subscription IDs on Production do NOT count as paid.
  Suspended/unpaid/expired access falls back to Free; a cancelled subscription
  remains paid only until the verified end of its paid period.
- Existing processes and workspaces are never automatically deleted on
  expiration or downgrade. Newly attempted creations above Free capacity
  will be rejected after the DB trigger migration has been applied.

## Important product discrepancy

Free currently has a default 2-member capacity while Individual is 1 member.
This is inherited behavior, NOT a newly approved pricing policy. Silently
reducing Free to 1 seat would break existing collaboration. Decide the
commercial rule first and migrate intentionally, with user communication.

## Outstanding validation and non-atomic paths

1. Run npm run test:entitlements, npm run test:creem, npx tsc --noEmit and CI.
2. Run scripts/sql/actiproc-entitlements-production-audit.sql in actual
   Supabase Production SQL Editor. The tool may show only the last SELECT.
3. Review and apply additive migration
   supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql.
   Git merge/deploy DOES NOT apply this database migration.
4. Test Free 2nd process, Individual 4th process, Pro 11th process,
   Pro 4th workspace and simultaneous creates on an actual test organization.
5. Test Production Test Mode Creem subscription rejection and paid expiry.
6. TEST LIMITATION: Invitation acceptance uses a non-atomic
   check-then-mutate pattern. Concurrent accepts can exceed purchased seats
   or leave partial membership. Requires a separate transactional DB RPC
   and careful handling of existing invite and users records.
7. TEST LIMITATION: Database triggers here protect process/workspace counts;
   DB-level business rules for premium reminders, Google sync and webhook
   writes still rely on authenticated server flows + RLS restrictions.
   Full DB-level enforcement across every feature is NOT yet demonstrated.
8. Live Creem checkout and real customer charge require separate merchant
   approval and go-live acceptance. Keep CREEM_CHECKOUT_ENABLED=false.

Avoid updating any organization plan, test-mode flag or seat count by hand
to simulate a paid entitlement in the production database.
