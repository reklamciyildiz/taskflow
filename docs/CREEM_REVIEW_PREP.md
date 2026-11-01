# Creem review preparation (staging only)

This branch does **not** change production Lemon Squeezy subscriptions. Do not merge or run migrations in production before account approval, legal review and live-mode E2E tests.

## Agreed public prices
- Free: $0, **1 process**
- Individual: **$12/year**, one seat; provisional limit: three processes
- Pro: **$4/seat/month** (per-user billing, same pricing unit as Team)
- Team: **$6/seat/month**, unlimited processes and workspaces

Creem TEST products must be recurring, USD, SaaS, **inclusive** tax mode, and use respective intervals. The $12/$4/$6 listed prices are tax-inclusive where applicable; verify the final country-specific checkout amount before enabling live sales. Switching to exclusive tax mode later requires explicit price and product review. Create in **Test Mode first**; never substitute test product IDs for live IDs.

## Environment variables (server-side only)
- `NEW_BILLING_PROVIDER=creem` enables Creem for **new** subscriptions; omit in production until approved.
- `CREEM_MODE=test` in local/preview; `live` only in production after approval.
- `CREEM_API_KEY`
- `CREEM_WEBHOOK_SECRET`
- `CREEM_PRODUCT_INDIVIDUAL`
- `CREEM_PRODUCT_PRO`
- `CREEM_PRODUCT_TEAM`

## Review gate
1. Apply `supabase/migrations/20261101110000_creem_parallel_billing.sql` to a **staging** DB first.
2. Configure a test key and three test product IDs; create webhook pointing to `/api/webhooks/creem`.
3. Test one checkout for every plan, renewal, cancellation, refund, dispute, portal, plan changes, seats, retries, duplicate/out-of-order webhooks and existing Lemon subscription preservation.
4. Verify that a failed payment never unlocks access and that no checkout can be created in Android TWA.
5. Verify legal/support pages and live product onboarding; provision a **temporary 100% discount test coupon** for Creem review only if requested.
6. Obtain Creem KYC approval and confirm Turkish tax/legal obligations with a professional.
7. Only then create live products/keys, run approved migration, enable production Creem and switch billing copy. Do not remove Lemon records until existing subscribers are resolved.

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
Use `CREEM_MODE=test` and initially keep `NEW_BILLING_PROVIDER=lemon`.
After a Test Mode API key is saved locally, run `npm run creem:verify-products`.
The command checks price, recurrence, tax mode, test environment and activity directly against Creem without printing any credentials.
Only enable `NEW_BILLING_PROVIDER=creem` against a migrated **staging database**, never against an unmigrated production database.
Checkout callback and webhook delivery need an accessible test origin, not a local-only localhost callback.
