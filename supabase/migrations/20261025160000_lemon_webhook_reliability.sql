-- Lemon Squeezy webhook reliability and authoritative subscription reconciliation.
-- Safe to prepare locally; apply to production only after env/config preflight.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ls_store_id TEXT,
  ADD COLUMN IF NOT EXISTS ls_product_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_pause_mode TEXT,
  ADD COLUMN IF NOT EXISTS subscription_test_mode BOOLEAN,
  ADD COLUMN IF NOT EXISTS lemon_subscription_updated_at TIMESTAMPTZ;

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'trialing', 'paused', 'expired'));

-- Deliberately fails if historical duplicate subscription assignments exist.
-- Resolve duplicates manually before applying rather than guessing ownership.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_ls_subscription_id
  ON organizations(ls_subscription_id)
  WHERE ls_subscription_id IS NOT NULL;

ALTER TABLE lemon_webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS resource_id TEXT,
  ADD COLUMN IF NOT EXISTS resource_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE lemon_webhook_events
SET status = 'completed', processed_at = COALESCE(processed_at, received_at), updated_at = NOW()
WHERE status IS NULL;

ALTER TABLE lemon_webhook_events
  ALTER COLUMN status SET DEFAULT 'processing',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE lemon_webhook_events DROP CONSTRAINT IF EXISTS lemon_webhook_events_status_check;
ALTER TABLE lemon_webhook_events
  ADD CONSTRAINT lemon_webhook_events_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'quarantined', 'ignored'));

CREATE INDEX IF NOT EXISTS idx_lemon_webhook_events_status_updated
  ON lemon_webhook_events(status, updated_at);

CREATE OR REPLACE FUNCTION claim_lemon_webhook_event(
  p_payload_hash TEXT,
  p_event_name TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_resource_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row lemon_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO lemon_webhook_events (
    payload_hash, event_name, status, attempts, resource_id, resource_updated_at,
    processing_started_at, updated_at
  ) VALUES (
    p_payload_hash, p_event_name, 'processing', 1, p_resource_id, p_resource_updated_at,
    NOW(), NOW()
  )
  ON CONFLICT (payload_hash) DO NOTHING;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT * INTO current_row
  FROM lemon_webhook_events
  WHERE payload_hash = p_payload_hash
  FOR UPDATE;

  IF current_row.status IN ('completed', 'ignored', 'quarantined') THEN
    RETURN 'duplicate';
  END IF;

  IF current_row.status = 'processing'
     AND current_row.processing_started_at > NOW() - INTERVAL '60 seconds' THEN
    RETURN 'busy';
  END IF;

  UPDATE lemon_webhook_events
  SET status = 'processing',
      attempts = attempts + 1,
      last_error = NULL,
      resource_id = COALESCE(p_resource_id, resource_id),
      resource_updated_at = COALESCE(p_resource_updated_at, resource_updated_at),
      processing_started_at = NOW(),
      updated_at = NOW()
  WHERE id = current_row.id;

  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION apply_lemon_subscription_snapshot(
  p_organization_id UUID,
  p_subscription_id TEXT,
  p_customer_id TEXT,
  p_store_id TEXT,
  p_product_id TEXT,
  p_variant_id TEXT,
  p_plan_name TEXT,
  p_subscription_status TEXT,
  p_seat_limit INTEGER,
  p_ends_at TIMESTAMPTZ,
  p_pause_mode TEXT,
  p_test_mode BOOLEAN,
  p_resource_updated_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE organizations
  SET ls_subscription_id = p_subscription_id,
      ls_customer_id = COALESCE(p_customer_id, ls_customer_id),
      ls_store_id = p_store_id,
      ls_product_id = p_product_id,
      variant_id = p_variant_id,
      plan_name = p_plan_name,
      subscription_status = p_subscription_status,
      seat_limit = p_seat_limit,
      subscription_ends_at = p_ends_at,
      subscription_pause_mode = p_pause_mode,
      subscription_test_mode = p_test_mode,
      lemon_subscription_updated_at = p_resource_updated_at
  WHERE id = p_organization_id
    AND (
      ls_subscription_id IS NULL
      OR ls_subscription_id = p_subscription_id
      OR subscription_status = 'expired'
    )
    AND (
      lemon_subscription_updated_at IS NULL
      OR lemon_subscription_updated_at <= p_resource_updated_at
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION claim_lemon_webhook_event(TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_lemon_webhook_event(TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION apply_lemon_subscription_snapshot(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_lemon_subscription_snapshot(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TEXT, BOOLEAN, TIMESTAMPTZ) TO service_role;
