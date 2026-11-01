# Actiproc Creem Billing — Test Mode acceptance protocol

## Current status (2026-11-01)
GitHub CI tests and in-memory Creem GET simulations are **not** equivalent to payment-provider end-to-end testing. Do not declare all flows certified until this list is executed on a disposable Test Mode organization and the results are recorded.

## Release dependency
1. Review the additive migration `supabase/migrations/20261101220000_creem_plan_change_safety.sql`. It extends seat reservation and creates a plan-upgrade single-flight lease. **Do not apply it to production without backup and release approval**.
2. Apply the migration to the intended test database using its normal controlled SQL migration process. This has NOT been executed by the assistant.
3. Read-only SQL post-check:
   ```sql
   SELECT to_regclass('public.creem_plan_changes') AS plan_changes_table;
   SELECT proname FROM pg_proc JOIN pg_namespace ns ON ns.oid=pronamespace
    WHERE ns.nspname='public' AND proname IN (
    'reserve_creem_plan_change','transition_creem_plan_change',
    'confirm_creem_plan_change','reserve_creem_seat_change');
   ```
4. With `CREEM_MODE=test` and properly isolated local test credentials, opt in `CREEM_PLAN_MUTATIONS_ENABLED=true` **only after the DB preflight passes**. Leave `CREEM_SEAT_MUTATIONS_ENABLED=true` only if its earlier guard migration is installed.
5. Run `npm run test:creem` and `npx tsc --noEmit`. Never paste API keys, signed tokens or real payment details in tickets.

## E2E matrix (every row needs provider + app evidence)
| Case | What to do in disposable Test Mode | Must be true |
|---|---|---|
| A01 | Create a Pro monthly subscription with 3 seats | Exactly one paid Creem checkout, 3 seats, list price $12/mo |
| A02 | Open 3→5 review, cancel without approval | No charge and no seat mutation |
| A03 | Approve 3→5 at day 8 | One new paid **invoice** matching customer, USD, transaction age; 5 seats only after verification |
| A04 | Inspect 3→5 renewal calendar | Show Creem's NEW next_transaction_date, not original anniversary+30 days |
| A05 | Invite fifth vs sixth distinct user | Fifth accepted, sixth rejected after confirmed 5-seat purchase |
| A06 | Add existing user to another team | No extra seat consumed |
| A07 | Two admins request 3→5 simultaneously | Exactly one DB reservation and provider mutation; other receives 409 |
| A08 | Card declined / 402 / provider timeout | No unverified seats unlocked, no blind retry of ambiguous charge |
| A09 | Delay, replay and reorder subscription.paid/update webhooks | No premature quota change or duplicate confirmation |
| A10 | Renewal invoice while seat mutation pending | Unrelated paid transaction not used as upgrade proof |
| A11 | Open Team plan preview and cancel | No charge |
| A12 | Approve Pro→Team | Atomic lease then one paid invoice required before Team features |
| A13 | Pro→Team from two browser tabs | One lease, one provider mutation, second blocked |
| A14 | Race seat increase against plan upgrade | Shared organization lock prevents both from charging |
| A15 | Plan upgrade card decline, timeout or mismatch | Previous Pro entitlements retained, lease requires review |
| A16 | Reduce seats below member usage | Block before Creem API |
| A17 | Reduce 5→3 after reducing members | No automatic refund promised; verify when Creem actually applies decrease |
| A18 | Cancel at period end | Access remains only as authorized; next charge not incorrectly advertised |
| A19 | Expire, pause, past_due, unpaid | Paid features not newly granted |
| A20 | Refund / dispute | Subscription hold, feature restriction, manual review |
| A21 | Resubscribe after final cancellation | Only a new verified paid checkout activates; no duplicate subscription linkage |
| A22 | Test Mode / Live Mode and native Android | Cannot initiate test charge on live store or native Play-distributed app |
| A23 | Concurrent first checkout from two tabs | Review and document provider behavior; **current legacy flow needs explicit E2E validation** |

## What the automated suite actually covers
- Signed approval expiration/tamper/mutation binding.
- Payment identity, currency/type/refund/chargeback and timing for paid seat increases and plan upgrades.
- Mocked GET /subscriptions and GET /transactions under success and failure.
- Static migration guards for atomic seat-vs-plan exclusion, access gates and webhook settlement.
- Mobile/web/auth regressions, TypeScript compilation.
- **Does not execute the SQL under PostgreSQL concurrency, perform actual Creem charges, or advance a real subscription renewal.**

## Stop conditions
- Any two paid transactions from one intended charge, unexpected plan entitlement, DB lease deadlock, or mismatched next billing date.
- The precise immediate proration amount cannot be quoted through the documented provider preflight API. The user must be told that the payable amount is calculated by Creem, not a number inferred from 30-day arithmetic.
- Unknown provider state after a mutation must remain locked for support reconciliation rather than automatically retrying.
