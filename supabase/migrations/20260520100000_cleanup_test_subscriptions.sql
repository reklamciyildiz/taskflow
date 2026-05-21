-- ============================================================
-- Clean up test-mode subscription data from organizations.
-- Run this in Supabase SQL Editor ONCE before going live.
-- Safe: all users will appear as "free" until they subscribe
-- via the live checkout. No user data (tasks/teams) is touched.
-- ============================================================

-- Preview first — check what will be reset:
-- SELECT id, name, plan_name, subscription_status, ls_subscription_id, ls_customer_id
-- FROM organizations
-- WHERE ls_subscription_id IS NOT NULL;

-- Reset all orgs that have stale test subscription IDs.
-- They will show as 'free' until they complete a live checkout.
UPDATE organizations
SET
  ls_subscription_id  = NULL,
  ls_customer_id      = NULL,
  variant_id          = NULL,
  plan_name           = 'free',
  subscription_status = 'active',
  seat_limit          = 1
WHERE ls_subscription_id IS NOT NULL;

-- Verify result — should return 0 rows after the update:
-- SELECT id, name, plan_name, ls_subscription_id
-- FROM organizations
-- WHERE ls_subscription_id IS NOT NULL;
