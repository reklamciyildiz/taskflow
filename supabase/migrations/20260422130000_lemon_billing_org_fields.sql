-- Lemon Squeezy billing fields for multi-tenant (organization-level) subscriptions
-- Notes:
-- - Billing is anchored to `organizations` (1 org = 1 subscription).
-- - We store Lemon identifiers + a normalized `plan_name` for gating.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ls_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS variant_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';

-- Optional: guardrails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_plan_name_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_plan_name_check
      CHECK (plan_name IN ('free', 'pro', 'team'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_subscription_status_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_subscription_status_check
      CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'trialing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_ls_subscription_id ON organizations(ls_subscription_id);
