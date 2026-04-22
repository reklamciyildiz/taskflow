-- Lemon Squeezy billing hardening:
-- 1) Seat limit tracking (Team subscriptions)
-- 2) Webhook idempotency via payload hash storage

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS seat_limit INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS lemon_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_hash TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lemon_webhook_events_received_at ON lemon_webhook_events(received_at);
