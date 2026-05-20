-- =============================================================
-- FIX: Enable RLS on tables added after the Jan-2026 migration
-- and re-enable it on webhooks/webhook_logs (incorrectly disabled).
--
-- Safe: all server-side code uses the service-role key which
-- bypasses RLS. No policies are needed — denying direct anon/JWT
-- access is the goal. The service role always has full access.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. push_subscriptions (added 2026-04-15)
--    Sensitive: push endpoint, auth keys
-- ---------------------------------------------------------------
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 2. google_calendar_connections (added 2026-04-16)
--    CRITICAL: contains encrypted OAuth refresh tokens
-- ---------------------------------------------------------------
ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 3. google_calendar_event_links (added 2026-04-16)
-- ---------------------------------------------------------------
ALTER TABLE google_calendar_event_links ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 4. project_members (added 2026-04-18)
-- ---------------------------------------------------------------
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 5. lemon_webhook_events (added 2026-04-22)
--    Sensitive: idempotency hashes for billing events
-- ---------------------------------------------------------------
ALTER TABLE lemon_webhook_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 6. projects (missing from original RLS migration)
-- ---------------------------------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 7. webhooks + webhook_logs — re-enable (was disabled 2026-01-13)
--    Rationale: service role bypasses RLS, so disabling it was
--    never necessary. Re-enabling protects direct anon API access.
-- ---------------------------------------------------------------
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 8. user_settings (added with google calendar migration)
--    Only enable if table exists (migration is idempotent).
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'user_settings'
  ) THEN
    EXECUTE 'ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ---------------------------------------------------------------
-- Verify — run after applying:
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
-- Every table should show rowsecurity = true.
-- ---------------------------------------------------------------
