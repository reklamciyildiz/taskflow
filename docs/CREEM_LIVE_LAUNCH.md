# Actiproc × Creem — production go-live gate

**Status: CODE READY FOR REVIEW; LIVE PAYMENTS NOT YET VERIFIED OR ACTIVATED BY THIS REPOSITORY CHANGE.**

Creem is the sole current application payment gateway. Historical SQL and
subscription metadata must remain until old subscriptions, chargebacks and
accounting retention obligations are settled. Deleting legacy columns or
rewriting transaction history would risk double billing.

## 1. Creem merchant approval (external)

Before launch, confirm in the **Creem Live dashboard**:

- Merchant KYC, payouts, bank/tax setup and live payment acceptance are
  approved. Published legal, privacy and refund pages are accurate.
- Five separate ACTIVE **live** recurring USD SaaS products:
  Individual **$12/year (one seat)**, Pro Monthly **$4/month/seat**,
  Pro Yearly **$40/year/seat**, Team Monthly **$6/month/seat**
  and Team Yearly **$60/year/seat**. All must use tax_mode `inclusive`
  and tax_category `saas`. The annual products are recurring, not one-time.
- Live IDs and API credentials are independent of Test Mode.
- The merchant of record shown at checkout is correct.
- Renewals, cancellation, refunds and the exact amount for prorated
  seat increases have been reviewed. The current saved-card change UI
  cannot provide a provider-backed exact pre-charge quote.

Official docs: https://docs.creem.io/skills/creem-api/REFERENCE
and https://docs.creem.io/skills/creem-api/WEBHOOKS

## 2. Supabase Production — READ ONLY

Run `scripts/sql/creem-production-readiness.sql` in the **actual Production
SQL Editor**. It checks the presence of tables and privileged functions,
counts legacy subscriptions, test-mode Creem subscriptions, payment holds,
unfulfilled checkouts, pending paid changes and failed webhook events.

Apply the reviewed additive migration
`supabase/migrations/20261107173000_creem_annual_product_intents.sql`
to the intended target database BEFORE opening checkout. It adds
`product_id` and `billing_interval` to `creem_checkout_intents`,
preserving existing rows and denying mismatched annual/monthly webhook
settlement. Run the read-only production SQL check again afterwards.

Never flip `creem_test_mode` by hand. Local Test Mode experiments may
have written to the primary database. A test subscription does NOT prove
real payment. Use a fresh organization for real checkout testing.
Historical tables and migration files must NOT be deleted.

## 3. Vercel Production settings (server only)

| Name | Production value |
| --- | --- |
| `CREEM_MODE` | `live` |
| `CREEM_API_KEY` | Actual Live secret |
| `CREEM_WEBHOOK_SECRET` | Matching **Live** webhook signing secret |
| `CREEM_PRODUCT_INDIVIDUAL` | Live Individual Product ID |
| `CREEM_PRODUCT_PRO` | Live Pro Monthly Product ID |
| `CREEM_PRODUCT_PRO_YEARLY` | Live Pro Yearly Product ID |
| `CREEM_PRODUCT_TEAM` | Live Team Monthly Product ID |
| `CREEM_PRODUCT_TEAM_YEARLY` | Live Team Yearly Product ID |
| `NEXT_PUBLIC_APP_URL` | `https://www.actiproc.com` |
| `NEXTAUTH_URL` | `https://www.actiproc.com` |
| `CREEM_CHECKOUT_ENABLED` | **false until formal go-live** |
| `CREEM_RESUBSCRIPTION_ENABLED` | **false until replacement E2E** |
| `CREEM_SEAT_MUTATIONS_ENABLED` | **false until seat E2E** |
| `CREEM_PLAN_MUTATIONS_ENABLED` | **false until plan E2E** |

No API key, webhook secret or raw payment information belongs in Git,
chat, screenshots or public environment variables.

A fresh Vercel Production deployment is necessary after changing
environment values. Do not accidentally deploy test credentials to live.

### Read-only live product check

Run in a trusted environment with actual live credentials:

    npm run creem:verify-live

This performs **GET** requests only. It confirms active product IDs,
production mode, USD prices, recurrence, tax and plan cadence, without
creating a checkout, customer, refund, subscription or charge.
Passing this test is necessary but NOT sufficient for production launch.

## 4. Register Live webhook

In the **Live Creem Dashboard**, use exactly:

    https://www.actiproc.com/api/webhooks/creem

Select applicable events: `checkout.completed`, `subscription.active`,
`subscription.paid`, `subscription.update`, `subscription.canceled`,
`subscription.scheduled_cancel`, `subscription.past_due`,
`subscription.unpaid`, `subscription.expired`, `subscription.trialing`,
`subscription.paused`, `refund.created`, `dispute.created`.

Set the corresponding Live signing secret in Vercel Production.
Webhook requests must reach the route via HTTPS without login/WAF
challenges. Do NOT rely on sender-IP allowlists (Creem does not offer
fixed outbound IPs); the application validates the raw-body HMAC
`creem-signature` header. Inspect delivery HTTP status and retries.
Subscription access only changes after a **verified paid** event and
authorized subscription reconciliation.

## 5. Go/no-go sequence

1. Confirm CI passes for the exact Git commit being deployed.
2. Verify merchant activation, five Live products, price/tax settings,
   Supabase production preflight and Vercel secret scope.
3. Verify the **Live webhook URL and secret**, including signed test
   delivery. Do not conflate Test Mode and Live Mode.
4. Only after authorization, set `CREEM_CHECKOUT_ENABLED=true` in
   Vercel Production and redeploy. This allows new paid checkout
   requests; by itself it does not charge existing customers.
5. Use a **new disposable free organization** for one explicitly
   authorized real-money Pro checkout. Confirm hosted checkout
   total, seats, live payment, signed webhook, exactly one linked
   subscription, correct paid entitlements, and functional portal.
6. Test duplicate/out-of-order webhooks, cancellation, renewals,
   refund/chargeback and partial failures. Keep direct saved-card
   seat and plan mutations disabled until their own E2E and
   no-double-charge guarantees are demonstrated.
7. Monitor webhook failures and pending checkout/seat/plan ledgers.
   For rollback, turn off NEW checkouts; do not disable webhooks
   required to maintain existing paid subscription state.

**NO-GO** when old subscriptions may be double charged, test-mode data
is misclassified as live payment, product prices differ, Creem has not
approved the merchant, verified webhooks cannot reach production or
pending paid operations are unexplained.

This checklist does NOT claim KYC approval, live charges, Vercel setup,
real webhook verification or production deployment were completed.


## Annual plan release safeguards

- Code offers monthly/yearly Pro and Team; purchases use distinct product IDs
  with Creem recurrence and tax validation immediately before any checkout.
- Checkout first records the exact product ID and billing interval in the
  restricted Supabase intent ledger. If the new migration is absent, checkout
  returns 503 BEFORE opening a hosted Creem payment page.
- A successful webhook must match the exact authorized checkout intent's
  product, not merely its plan ("pro"/"team"). Older test intents are scoped
  only to their original legacy monthly product (Individual yearly).
- Existing subscriptions keep their provider-verified cadence. A plan upgrade
  from Individual yearly must select Pro yearly, and from Pro yearly to
  Team yearly. Monthly-to-yearly cadence switches are NOT performed by this
  integration; use merchant support/portal until separately tested.
- Seat mutation reviews show annual totals for annual subscribers, never
  falsely identify their future rate as monthly. Final same-card proration
  is still calculated by Creem and unknown ahead of confirmation.
- **DO NOT** enable CREEM_CHECKOUT_ENABLED until Production has the schema,
  all five Product IDs, a read-only five-product verification pass, merchant
  approval and an authenticated signed webhook delivery. Keep
  CREEM_SEAT_MUTATIONS_ENABLED, CREEM_PLAN_MUTATIONS_ENABLED and
  CREEM_RESUBSCRIPTION_ENABLED false until separate provider acceptance.
- No existing customer is migrated from monthly to annual automatically;
  no subscription, payment or database record is mutated by deploying code.
