# Creem billing cycle behavior — Actiproc (2026-11-01)

## Authoritative behavior
- One Creem subscription with `items[0].units` for all paid Pro/Team seats.
- `proration-charge-immediately` **charges now and starts a new billing cycle**, according to [Creem API Reference](https://docs.creem.io/skills/creem-api/REFERENCE).
- `proration-charge` adds proration to the next invoice and preserves the existing cycle; it **does not** prove the seats have been paid for immediately, so switching to it without updating access rules would be unsafe.
- `proration-none` does not prorate and may defer the effective change to the next cycle.
- The exact immediate debit (including tax, prior credit, discounts, rounding) **cannot currently be quoted from a documented Creem preflight API**. Show the monthly list price and an explicit non-quote warning. Never claim today's charge equals the added seats' full monthly price.
- `next_transaction_date` is the next scheduled charge when the provider confirms an active/trialing subscription; `current_period_end_date` is not automatically a renewal invoice date.
- Never calculate a next charge as the original start date + 30 days (months differ and Creem can reset its cycle).

## Example: three seats to five, eight days later
Three Pro seats begin November 1 for a $12 *monthly list price*. Adding two on November 9 uses an **immediate Creem-calculated prorated adjustment**; the exact amount cannot be known without a provider invoice. The new monthly *list price* is $20 for five seats. The next renewal date **may move** because the immediate-charge flow starts a new billing cycle. Only the subscription's **freshly retrieved next_transaction_date after update** establishes the actual due date. Do not assume the extra seats have their own second renewal date.

## Release checks
1. Confirm provider invoice for original 3-seat purchase, record actual next_transaction_date.
2. Preview 3→5: list price $20, current verified next date and reset warning; cancel without charge.
3. Confirm 3→5 with Test Mode card; ensure one new paid transaction, exact amount from Creem, remote units=5.
4. After webhook/reconcile, refresh Billing: show the **new** provider date and period end, verify seat cap=5 and a sixth unique member blocked.
5. Verify stale confirmation becomes invalid if next_transaction_date or current_period_end_date changes, even when other attributes appear stable.
6. Verify missing next_transaction_date is shown as unavailable, not silently replaced with period_end or original anniversary.
7. Verify canceled/paused/failed status displays no promised next charge.
8. Reduce seats only if active members fit; explain refund limitations and confirm when Creem applies the reduction.
9. Repeat for Pro→Team and a subscription near its renewal boundary, including webhook race/timeout handling.
10. Keep Live Mode and payment-provider account untouched during these tests.

## Outstanding provider limitations
If fixed billing anniversary and **known exact debit prior to authorization** are hard business requirements, Creem's current immediate-charge mutation does not satisfy them by itself. A provider that supports preflight invoice previews / configurable billing anchors (or a custom deferred settlement model with explicit limitations) would be necessary. Do not declare this as solved by frontend calculation.
