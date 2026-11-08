# Actiproc — Production plan entitlements launch review (2026-11-08)

Source review: GitHub main, commit 3823e1b (before this documentation-only audit). This is **not** an authenticated Production test or proof of a real settled payment. No production SQL, payment or deployment made by this audit.

## Plan matrix verified in code

| Dimension | Free | Individual | Pro | Team |
|---|---|---|---|---|
| Process | 1 | 3 | 10 | Unlimited |
| Workspace | 1 | 1 | 3 | Unlimited |
| Seats | 1 | Purchased | Purchased | Purchased |
| Daily AI / user | 10 | 50 | 100 | 150 |
| Monthly AI / organization | 30 | 300 total | 800 per paid seat | 1200 per paid seat |
| Advanced reminders / Google Calendar | No | No | Yes | Yes |
| Outgoing webhooks | No | No | No | Yes |

Prices: Individual $12/seat/year, Pro $4/seat/month or $40/seat/year, Team $6/seat/month or $60/seat/year. AI-funded Pro/Team scaling stops at 20 seats. All tiers include core Actions, Notes, Knowledge Hub, basic Planner, attachments, basic due-time reminders and appropriate scoped roles.

## Source-verified gates

- Processes/Workspaces: server-side getPlanLimits; AFTER applied migrations PostgreSQL BEFORE INSERT row-locking triggers.
- Invitations and team members: atomic service-role-only RPC and database seat-limit trigger; tested with concurrent invitations on disposable PostgreSQL 16.
- Advanced reminders: schedule-write guard and separate entitlement check at REMINDER DELIVERY, including downgrades.
- Google Calendar: OAuth start, OAuth callback, calendar listing, connection updates and background sync gated to active Pro/Team.
- Outgoing Team webhooks: CRUD, delivery and retry paths use server-side entitlement checks.
- AI Chat and description generator: authenticated, org-scoped, atomic request quotas and provider token admission; no trusted client-supplied plan.
- Billing: checkout validates product price/interval/mode and purchased units; webhook verifies signed paid checkout against an authorized intent; expired/test accounts are not treated as live paid.

## Priority P1: Commercial downgrade loophole confirmed in source
After a paid-to-Free downgrade, creating NEW Processes/Workspaces/members is blocked; but the existing above-plan content and previously counted members remain accessible and editable. Process/team PATCH and task writes lack a post-downgrade over-capacity read-only check. A Team customer could create dozens of Processes and continue operating them after downgrade. Preserve data, but define and implement an active-capacity selection plus read-only/archival policy. Grandfather historical Free records deliberately rather than silently removing data. This is not a demonstrated cross-tenant breach.

## Priority P1: Live billing lifecycle not independently verified
Checkout redirect is not payment confirmation. Live paid card settlement, webhook, entitlement activation, refund, renewal, cancellation, failed card and seat mutation need authenticated Production test evidence. CI source contracts do not prove them.

## Priority P1: Environment/migration dependencies are unknown
- CREEM_SEAT_MUTATIONS_ENABLED and CREEM_PLAN_MUTATIONS_ENABLED may block paid management when disabled. CREEM_RESUBSCRIPTION_ENABLED governs terminal re-subscription.
- The new Individual multi-seat re-subscription migration 20261108230000 exists in main but was not independently confirmed applied to Production.
- AXIOM_AI_BETA_MODE_ENABLED defaults to beta when not explicitly false. Public AI additionally needs atomic quota + provider-token RPCs; current code deliberately rejects public Chat if AI write/mutation tools are enabled. Verify the Vercel Production flags and marketing promise.
- Automatic Vercel deployment is disabled in vercel.json; GitHub main does not prove Production has the same commit.

## P2: Migration and documentation drift
Earlier operator SQL found 1 Free over-seat org, 2 over-Process orgs and 1 over-Workspace org; existing content intentionally preserved. Some sections of docs/ACTIPROC_PLAN_ENTITLEMENT_MATRIX.md still mention Free=2, checkout disabled and earlier migration not applied, although operator has reported applying it. This document supersedes those stale status statements.

## One-result read-only Production check
Run scripts/sql/actiproc-production-entitlement-launch-audit.sql in Supabase SQL Editor. It reports effective vs stored plans, capacity overages, three triggers, RPC execution privileges, unfulfilled checkout intents, pending seat/plan changes and failed/quarantined webhook counts. It returns one JSON result without exposing customer identifiers.

## Required test set before claiming full sales readiness
- Free limit overflows; paid Individual multi-seat annual checkout; Pro process/workspace cap, advanced reminders, Google calendar, Team webhook delivery.
- Paid→Free expiration/downgrade with old content and members; concurrency of invitation accepts; malicious cross-organization APIs.
- AI quotas per plan and per user/month; Test Mode on Production, expired, cancelled end-of-period.
- Completed real card checkout and signed webhook; changed/failed card, renewal, refunds/disputes, duplicate webhook and multi-seat proration.
- Portal, plan upgrade, seat decrease and genuine terminal re-subscription after required SQL/function rollout.

**Overall:** Core central design and major endpoint gates exist; conditional/revenue loopholes and Production billing lifecycle validation remain. Do not claim 100% verified or silently relax payment security flags.
