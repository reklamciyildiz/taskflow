-- Actiproc / Creem: PRODUCTION READ-ONLY launch preflight.
-- Run against the intended Production Supabase SQL Editor.
-- This file performs NO writes, DDL, subscription changes or payments.
-- Do not share customer emails, raw IDs, API keys or transaction details.
BEGIN READ ONLY;

-- 1. Expected structures and privileged functions (NULL means missing).
SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
FROM (VALUES
  ('creem_checkout_intents'),
  ('creem_webhook_events'),
  ('creem_subscription_history'),
  ('creem_seat_changes'),
  ('creem_plan_changes')
) AS expected(name)
ORDER BY name;

SELECT routine_name, COUNT(*) AS overloads
FROM information_schema.routines
WHERE routine_schema='public'
  AND routine_name IN (
    'claim_creem_event','apply_creem_subscription_snapshot',
    'hold_creem_subscription','reserve_creem_resubscription',
    'apply_creem_resubscription','reserve_creem_seat_change',
    'confirm_creem_seat_change','reserve_creem_plan_change',
    'confirm_creem_plan_change'
  )
GROUP BY routine_name ORDER BY routine_name;

-- 2. Count historical subscriptions BEFORE switching to live.
-- A nonzero active TEST-mode subscription in the Production DB is NOT a
-- live paid subscription. Never convert it by editing these columns.
SELECT
  COUNT(*) AS organizations_total,
  COUNT(*) FILTER (WHERE billing_provider='lemon') AS historical_provider_orgs,
  COUNT(*) FILTER (WHERE ls_subscription_id IS NOT NULL) AS historical_subscription_refs,
  COUNT(*) FILTER (WHERE billing_provider='creem') AS creem_provider_orgs,
  COUNT(*) FILTER (WHERE creem_subscription_id IS NOT NULL AND creem_test_mode IS TRUE)
    AS creem_test_mode_orgs,
  COUNT(*) FILTER (WHERE creem_subscription_id IS NOT NULL AND creem_test_mode IS FALSE)
    AS creem_live_mode_orgs,
  COUNT(*) FILTER (WHERE creem_subscription_id IS NOT NULL
    AND creem_test_mode IS TRUE
    AND subscription_status IN ('active','trialing','cancelled')) AS test_subscriptions_with_potential_access,
  COUNT(*) FILTER (WHERE creem_subscription_id IS NOT NULL
    AND creem_test_mode IS FALSE
    AND subscription_status IN ('active','trialing')) AS active_live_subscriptions,
  COUNT(*) FILTER (WHERE creem_payment_hold IS TRUE) AS orgs_on_payment_hold
FROM public.organizations;

-- 3. Look for pending paid operations and webhook problems.
SELECT
  (SELECT COUNT(*) FROM public.creem_checkout_intents
    WHERE fulfilled_at IS NULL) AS unfulfilled_checkout_intents,
  (SELECT COUNT(*) FROM public.creem_webhook_events
    WHERE status IN ('failed','quarantined')) AS webhook_events_needing_review,
  (SELECT COUNT(*) FROM public.creem_seat_changes
    WHERE status IN ('pending','awaiting_sync','review')) AS open_seat_changes,
  (SELECT COUNT(*) FROM public.creem_plan_changes
    WHERE status IN ('pending','awaiting_sync','review')) AS open_plan_changes,
  (SELECT COUNT(*) FROM public.creem_subscription_history) AS historical_creem_links;

COMMIT;

-- IMPORTANT:
-- If any expected table/function is absent, stop and review migrations.
-- If historical provider orgs or test-mode subscriptions are present,
-- protect those records and use a NEW free organization for a verified
-- live checkout. Never UPDATE them to live mode or delete historic SQL.
-- These counts do not prove live Creem keys or webhook delivery: validate
-- both in the Creem live dashboard before allowing new paid customers.
