# Actiproc — Creem billing release gate (2026-11-01)

Status: **CODE CHECKS PASS; END-TO-END RELEASE NOT APPROVED**.
This document distinguishes automatic tests from real provider validation. No real charge, cancellation, database mutation or refund is triggered by this checklist.

## Verified automatically in GitHub Actions
- `npm run test:creem`: static billing contracts, signed-consent expiration/tampering, changes in org/subscription/plan/seats/transaction/mode, webhook guard markers.
- `npm run test:mobile-web`, `npm run test:capacitor-oauth`, `node scripts/test-capacitor-mobile-shell.mjs`.
- `npx tsc --noEmit`.
- The checkout code validates configured Creem product pricing and billing mode; new seat and upgrade previews also validate merchant product pricing before approving any saved-card charge.

## Manual E2E matrix — MUST be run on isolated Test Mode accounts
Never run these directly against production or shared customer accounts. Record timestamps, provider transaction IDs privately (do not paste secrets), org and seat usage snapshots, and screenshots of the review + final result.

| # | Scenario | Expected result | Evidence |
|---|---|---|---|
| 1 | Initial Free → Pro checkout (1 seat) | Redirects to hosted Creem checkout; only paid checkout activates Pro | Pending |
| 2 | Close seat review without ticking checkbox | No POST confirmation, no Creem charge, no seat mutation | Pending |
| 3 | 3 → 4 preview and confirm | New list price $16/mo; final charge explicitly disclosed as unknown; confirmation required before the API mutation; a fresh positive paid transaction appears | Pending |
| 4 | 3 → 4 invalid/expired/tampered token | 409 CONSENT_REQUIRED, no mutation or charge | Code tests passed; HTTP E2E pending |
| 5 | Same consent reused with different org, sub, current transaction or seat count | Rejected server-side, no charge | Unit tests passed; HTTP E2E pending |
| 6 | Two simultaneous 3 → 4 confirmations / two browser tabs | Only one mutation reserved; other blocked | Pending |
| 7 | Charge failed / card declined | Payment error or review state; never unlocks new seats | Pending |
| 8 | Provider responds but webhook is delayed | Pending status, previous authorized seat limit stays effective | Pending |
| 9 | Provider timeout after possible charge | No automatic retry; locked for review, manual reconciliation | Pending |
| 10 | Unrelated renewal `subscription.paid` arrives while a change is pending | Must not falsely confirm changed seats; inspect actual paid transaction | Pending — provider-specific risk |
| 11 | Add fourth member after confirmed 4-seat charge | Allowed; fifth distinct member blocked, even under concurrent invites | Pending |
| 12 | 4 → 3 with three occupied seats | Explicit reduction review; reduced limit, no promised automatic refund | Pending |
| 13 | Reduce below actual member count | 409 SEATS_IN_USE; no provider call | Pending |
| 14 | Pro → Team (same seat quantity) | New signed review + deliberate saved-card approval; correct remote product pricing | Pending |
| 15 | Cancel / scheduled cancel / resume | Correct end-of-term access and renewal handling; no unsupported terminal resume | Pending |
| 16 | Expired/canceled re-subscription | New paid hosted checkout and verified fulfillment; no duplicate subscription assignment | Pending |
| 17 | Subscription `past_due`, `unpaid`, `paused` | Paid entitlements cannot be newly granted; management UI responds appropriately | Pending |
| 18 | Refund / dispute / reversed transaction | Payment hold and manual review without silent continued premium access | Pending |
| 19 | Webhook duplicate/reorder/retry | Idempotent event journal and no double activation | Pending |
| 20 | Production/test environment and native app isolation | Test credentials cannot run on prod; native apps cannot initiate external billing changes | Automated contracts passed; deployment E2E pending |
| 21 | New renewal invoice | 4 seats at Pro $4 each normally means $16/mo (subject to tax/discount); verify actual provider invoice | Pending |

## Product and provider limitations
Creem's examined public API reference documents `proration-charge-immediately` but not a reliable pre-mutation exact-charge quotation endpoint. Our UI **must not** present monthly list price as the exact immediate charge. The signed confirmation explicitly acknowledges that the provider computes the final prorated charge. If the business requires *exact* payable amount before purchase, **do not enable the immediate saved-card mutation in production** until a provider-backed quote or hosted checkout is available.

Plan upgrades now have a *proposed* persisted single-flight SQL ledger, shared with seat reservations. It must be applied to the test database, enabled via CREEM_PLAN_MUTATIONS_ENABLED=true, and verified with actual concurrent requests before claiming protection. By default paid plan upgrades fail closed (disabled), rather than risking duplicate card charges.

## Release decision
**DO NOT DEPLOY as a claim of complete billing verification** until live Test Mode evidence covers the pending rows and unresolved provider-quote / plan-upgrade concurrency risks are handled. Current draft PR is safe to inspect and run CI without touching real customer billing.

See [the executable Test Mode acceptance matrix](CREEM_BILLING_E2E_ACCEPTANCE.md) for rollout prerequisites and 23 provider-level scenarios. The assistant has not applied SQL or called Creem Test Mode on your behalf.
