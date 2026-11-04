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
- Three separate ACTIVE **live** recurring USD SaaS products:
  Individual **$12/year (one seat)**, Pro **$4/month/seat** and
  Team **$6/month/seat**. Their tax_mode is `inclusive`.
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
| `CREEM_PRODUCT_PRO` | Live Pro Product ID |
| `CREEM_PRODUCT_TEAM` | Live Team Product ID |
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
2. Verify merchant activation, three Live products, price/tax settings,
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
