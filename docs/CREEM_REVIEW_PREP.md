# Creem review preparation (staging only)

Actiproc now has a single Creem runtime. Production checkout is disabled until account approval, legal review, and live-mode E2E tests.

## Agreed public prices
- Free: $0, **1 process**
- Individual: **$12/year**, one seat; provisional limit: three processes
- Pro: **$4/seat/month** (per-user billing, same pricing unit as Team)
- Team: **$6/seat/month**, unlimited processes and workspaces

Creem TEST products must be recurring, USD, SaaS, **inclusive** tax mode, and use respective intervals. The $12/$4/$6 listed prices are tax-inclusive where applicable; verify the final country-specific checkout amount before enabling live sales. Switching to exclusive tax mode later requires explicit price and product review. Create in **Test Mode first**; never substitute test product IDs for live IDs.

## Environment variables (server-side only)
- Creem is the only active application gateway. `NEW_BILLING_PROVIDER` is obsolete; production checkout is controlled exclusively by `CREEM_CHECKOUT_ENABLED` and `CREEM_MODE=live`.
- `CREEM_MODE=test` in local/preview; `live` only in production after approval.
- `CREEM_API_KEY`
- `CREEM_WEBHOOK_SECRET`
- `CREEM_PRODUCT_INDIVIDUAL`
- `CREEM_PRODUCT_PRO`
- `CREEM_PRODUCT_TEAM`

## Review gate
1. Apply `supabase/migrations/20261101110000_creem_parallel_billing.sql` to a **staging** DB first.
2. Configure a test key and three test product IDs; create webhook pointing to `/api/webhooks/creem`.
3. Test one checkout for every plan, renewal, cancellation, refund, dispute, portal, plan changes, seats, retries, duplicate/out-of-order webhooks and legacy database record protection.
4. Verify that a failed payment never unlocks access and that no checkout can be created in Android TWA.
5. Verify legal/support pages and live product onboarding; provision a **temporary 100% discount test coupon** for Creem review only if requested.
6. Obtain Creem KYC approval and confirm Turkish tax/legal obligations with a professional.
7. Only after account approval and testing, create live products/keys, deploy them via Vercel server secrets and set CREEM_CHECKOUT_ENABLED=true in production. Do not remove historical database migrations.

Important: website text and marketing price cards are not proof of a completed payment. Authoritative subscription data must come from verified Creem responses and webhooks.

## Support and refunds
The registered review support address is the currently working Gmail mailbox. Verify any Vercel NEXT_PUBLIC_CONTACT_EMAIL override. `/refunds` documents cancellation and the provider-specific refund process without inventing guaranteed refunds.

## Product IDs and local environment
Three Test Mode products were created in the Creem dashboard on 2026-11-01:
Individual USD 12/year, Pro USD 4/month per purchased seat and Team USD 6/month per purchased seat.
Copy each **Product ID** from the Product detail panel into the corresponding `.env.local` key:
`CREEM_PRODUCT_INDIVIDUAL`, `CREEM_PRODUCT_PRO`, `CREEM_PRODUCT_TEAM`.
Product IDs are not API keys. Verify the exact strings via the dashboard's copy button rather than manually transcribing screenshots.

Do not replace the existing contents of `.env.local` and do not upload that file.
The API key and webhook secret must be generated from Creem's **Test Mode** settings; these cannot be inferred from Product IDs.
Use `CREEM_MODE=test` and `CREEM_CHECKOUT_ENABLED=true` only against the dedicated staging Supabase project. Checkout is off by default.
After a Test Mode API key is saved locally, run `npm run creem:verify-products`.
The command checks price, recurrence, tax mode, test environment and activity directly against Creem without printing any credentials.
Only enable Creem checkout against a reviewed and migrated database; `CREEM_CHECKOUT_ENABLED` defaults to false. See [live launch gate](CREEM_LIVE_LAUNCH.md).
Checkout callback and webhook delivery need an accessible test origin, not a local-only localhost callback.

## Staging migration inventory (important)

The staging bootstrap now registers the Creem migration as `20261101110000 creem_parallel_billing`.
Before *any* database write, run `npm run staging:db:check` and inspect `pendingMigrations`.
A previous check on 2026-11-01 returned 51/52 applied. That missing historical migration has NOT been identified; **do not apply all pending migrations blindly**.
The Creem SQL must only run on the separately verified staging project, never the live production database.
If you execute the Creem SQL manually in the staging SQL editor, that does **not** automatically register it in the bootstrap's own `supabase_migrations.axiom_schema_migrations` table. Prefer a reviewed migration apply with tracked checksum, or explicitly reconcile migration history before later bootstrap applies.

## Safe manual-SQL audit
Because the Creem and Lemon reliability SQL were run manually in Supabase SQL Editor, the separate `supabase_migrations.axiom_schema_migrations` tracker still reports pending versions. On the dedicated staging project, run `npm run staging:billing:inspect` after `npm run staging:db:check`. This new inspection is **read-only** and checks columns, constraints, indexes, RLS, server-only permissions, RPC security and guard logic. A pass is a structural safety check, **not** a cryptographic proof that every DDL/data migration statement was replayed or that webhooks work. Do not blindly execute `staging:db:apply` or insert missing history rows until reviewed; migration-history reconciliation must use manifest checksums from the exact SQL source.

## When the staging inspector fails all checks
If SQL Editor reported Creem structures as present but `npm run staging:billing:inspect` reports every billing structure missing, the SQL Editor and CLI most likely targeted **different Supabase projects**. The inspector prints a staging-specific `stagingSqlEditor` link derived from `.env.staging.local`. Open *that exact link* and run read-only catalog queries. Do not replay the migrations or mark history as applied until their actual destination is confirmed. If manual SQL was inadvertently run against production, audit production first; do not automatically roll it back.

## Single-main deployment
The shipping code is Creem-only. Historical Lemon SQL remains for reproducible migration history, but checkout, portal, subscription changes, SDK, and webhook routes no longer call Lemon. GitHub main can deploy with `CREEM_CHECKOUT_ENABLED=false` (default).
Test locally using the isolated staging project: copy the validated Creem Test Mode product IDs, API key and webhook secret to `.env.staging.local`, set `CREEM_MODE=test` and `CREEM_CHECKOUT_ENABLED=true`. Test checkouts explicitly require `AXIOM_STAGING_SUPABASE_PROJECT_REF` to match the app Supabase URL; a standard `.env.local` pointing to production is refused.
For production: obtain Creem approval, create separate live products and secrets, configure the production webhook, set `CREEM_MODE=live`, then intentionally set `CREEM_CHECKOUT_ENABLED=true` in Vercel Production. Production never uses a test key or test product IDs.

## Production audit and checkout retry safety
Production Supabase was manually migrated before staging; object presence alone does not
prove every column, constraint, privilege and RPC matches the intended SQL. Inspect
production in **read-only** SQL Editor before turning on payments. Never replay an
existing migration or modify migration history based solely on an object existence test.
A checkout already carrying a Creem subscription ID (even if expired or on hold) is
deliberately blocked to prevent double charges until a dedicated resubscription flow
is implemented. Retried checkout webhooks verify linked subscription ownership before
acknowledging an already fulfilled checkout.

## Approved primary Supabase local Test Mode (single main branch)
Use `main`, `.env.local`, and the **primary** Supabase project. No staging env is necessary.
Set these LOCAL-only values (never commit secrets):
```dotenv
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
CREEM_MODE=test
CREEM_CHECKOUT_ENABLED=true
CREEM_TEST_ON_PRIMARY_DB=true
CREEM_API_KEY=<test API key>
CREEM_WEBHOOK_SECRET=<test webhook signing secret>
CREEM_PRODUCT_INDIVIDUAL=<test product ID>
CREEM_PRODUCT_PRO=<test product ID>
CREEM_PRODUCT_TEAM=<test product ID>
```
Keep the existing primary Supabase URL, public key and service role key unchanged.
Start `npm run dev` and expose only localhost for Creem Test Mode webhooks with
`cloudflared tunnel --url http://localhost:3000`. In Creem **Test Mode**, register
the resulting HTTPS tunnel URL plus `/api/webhooks/creem`; paste its generated
secret to `.env.local` then restart `npm run dev`. No test webhook goes to
`www.actiproc.com`, because its production runtime intentionally rejects test keys.
Run payment tests against an organization you own. Test subscriptions and webhook
events are written into the real primary DB and can unlock a plan in the live app;
reset them deliberately after testing, never through bulk table deletion.

Safety: `CREEM_TEST_ON_PRIMARY_DB=true` is ignored on Vercel (preview and production),
in production NODE_ENV, without an explicit checkout flag, or unless NEXTAUTH_URL
is localhost. Production requires separately approved Creem live credentials,
CREEM_MODE=live, VERCEL_ENV=production, and deliberate checkout activation.

## Replacement checkout for terminal Creem cancellations (feature-gated)
Code support is present, but **no production migration was run**. The primary database requires the **reviewed** `supabase/migrations/20261101170000_creem_safe_resubscription.sql` migration, executed only after explicit approval. This adds a historical subscription-ID mapping and privileged, transactionally guarded RPCs; it does not modify existing subscriptions at installation.

Default `CREEM_RESUBSCRIPTION_ENABLED=false`. Only turn it on *locally* after verifying that the SQL has been applied. A new subscription requires the customer to explicitly acknowledge a new, immediate charge and the lack of automatic credit for unused earlier time. It creates an authorized checkout tied to the **existing Creem customer ID**. A paid, validated checkout then atomically archives the old subscription ID and assigns the new one; late events from the superseded ID cannot modify the new subscription. Test purchase, duplicate webhook delivery, post-cancellation renewals, refunds, and actual Plan/Seat entitlements before enabling the feature in production.
