# Actiproc Creem seat billing: release and safety guide

## Supported plans and quantity
Individual: fixed 1 paid seat, $12/year. Pro: $4/seat/month. Team: $6/seat/month. 1–500 purchased seats. A member cannot be invited once usage reaches the purchased quota, and a reduction cannot go below existing member usage. Invited-but-not-joined users are not counted as seats in the existing membership model; review that policy before general B2B rollout.

## What changed
- Each seat request is made by an authenticated organization administrator.
- The real Creem subscription ID, customer ID, product ID, mode, item ID and current seat count are verified before mutation.
- Postgres \`reserve_creem_seat_change\` is an atomic single-flight reservation. Two tabs or two admins cannot start two charges at once.
- Failed/ambiguous provider operations remain auditable. Unknown outcomes are put into \`review\` and cannot be retried into a second charge.
- Increase: Creem calculates immediate proration. Paid seats are not granted until a verified paid transaction or signed \`subscription.paid\` event. Simply seeing \`subscription.update\` does not lift a pending cap.
- Decrease: requires the user to acknowledge potentially immediate reduction with no automatic refund. It cannot go below actual occupied seats. Creem's proration-none behavior is provider-specific; do not promise end-of-cycle scheduling.
- Webhook and explicit reconciliation can close safe, authoritative operations; no direct optimistic limit increase.

## Manual rollout (PRIMARY Supabase; no staging branch)
1. Keep \`CREEM_SEAT_MUTATIONS_ENABLED=false\` in Vercel.
2. Review/apply \`supabase/migrations/20261101180000_creem_seat_change_safety.sql\` in the **primary** Supabase SQL Editor. It only adds seat-change journal and service-role functions; it does not mutate existing subscriptions.
3. Verify \`to_regclass('public.creem_seat_changes')\` exists and the functions \`reserve_creem_seat_change\`, \`transition_creem_seat_change\`, \`confirm_creem_seat_change\` exist. Check the unique partial index and RLS.
4. In **local-only** \`.env.local\`, enable \`CREEM_SEAT_MUTATIONS_ENABLED=true\` with the existing Creem test credentials, the primary Supabase and Cloudflare webhook tunnel. Restart \`npm run dev\`.
5. On a separate test Pro organization, change 1→5 seats. Check Creem's billing record and the new \`creem_seat_changes\` row. Do not retry a failed or pending operation automatically.
6. Once the provider confirms paid, refresh Billing. The operation should transition to \`confirmed\` and the effective quota to 5. Verify invite #5 allowed, #6 rejected; try reducing to 3 while five seats are occupied (must reject), and then 5→3 after members leave (must require acknowledgement).
7. Test duplicate admin requests, bad payment method, webhook retry/out-of-order delivery, provider timeout, manually expired/paused/cancelled subscription, and read-only mobile usage.
8. Only after successful testing, configure **Live** Creem and \`CREEM_SEAT_MUTATIONS_ENABLED=true\` on Vercel. No UI-only test can prove actual proration/charge without inspecting Creem's transaction record.

## Diagnostics
- \`SEAT_DATABASE_NOT_READY\`: migration/permissions missing.
- \`STALE_SEAT_STATE\`: local/provider seats disagree; refresh.
- \`ITEM_MISMATCH\`: Creem did not return the expected subscription item.
- \`CREEM_REJECTED\`, \`PAYMENT_REQUIRED\`, \`CREEM_UNAVAILABLE\`: provider failed, check safe server logs; optional trace ID may help Creem support.
- \`SEAT_CHANGE_IN_PROGRESS\`: previous seat operation unconfirmed; inspect Creem + journal before attempting another charge.
Do not delete pending journal rows or reset paid seats manually to force a test to pass.

## Membership and invitation enforcement
A database trigger on `public.team_members` (scoped to organizations with a Creem subscription) serializes membership additions using an organization-row lock, counts *distinct users* across teams, enforces an active/cancelled-paid-through cap and prevents pending increases from granting unpaid seats. An existing member joining a second team does not pay twice. The invitation-accept flow also prechecks the cap before creating the new user, although the trigger is the final concurrent source of truth. These safeguards become active only after the migration has been executed on the primary Supabase project.

## Read-only primary Supabase verification
Run in the **primary** project's SQL Editor after reviewing/applying the seat migration:
```sql
SELECT
  to_regclass('public.creem_seat_changes') IS NOT NULL AS seat_journal,
  to_regprocedure('public.reserve_creem_seat_change(uuid,text,integer,integer,boolean,text)') IS NOT NULL AS reservation_rpc,
  to_regprocedure('public.transition_creem_seat_change(uuid,text,text)') IS NOT NULL AS transition_rpc,
  to_regprocedure('public.confirm_creem_seat_change(uuid,text,integer,text)') IS NOT NULL AS confirmation_rpc,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_creem_team_member_seat' AND NOT tgisinternal
  ) AS membership_trigger;
```
All five values must be `true` before enabling the seat mutation flag.

The original generic 502 error was not diagnosable from a screenshot. The improved server logs include the provider HTTP status and, if available, a safe Creem trace ID; they do not expose API keys. If the failure recurs, record only the logged HTTP status, provider code and trace ID.

## Current 404 investigation, November 2026
The real Creem Test Mode subscription GET confirmed `active`, matching Pro product,
one `sitem_` item and `units:1`, but omitted `price_id`. This is **not**
evidence of a broken subscription: Creem's documented `POST /v1/subscriptions/{id}`
quantity update uses `{items:[{id,units}],update_behavior}`. The previous
mandatory `price_id` check was a local false negative. The 404 on the earlier POST
remains **unresolved**: it occurred with the documented minimal body, before the
mandatory price guard was introduced. Do not claim changing the body fixes the
404 without a successful external call. If it recurs, send Creem support the
test request's HTTP status and trace ID; keep the subscription/account information
private. Until the provider confirms seat updates, do not enable the flag for
production. Do not substitute a new checkout for seat increments; that creates a
second subscription and different billing semantics.
