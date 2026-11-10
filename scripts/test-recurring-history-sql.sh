#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public.users(id uuid PRIMARY KEY);
\i supabase/migrations/20260416110000_create_user_settings.sql
\i supabase/migrations/20261110213000_missed_recurrence_preferences.sql
-- Reapplying must be safe.
\i supabase/migrations/20261110213000_missed_recurrence_preferences.sql

INSERT INTO public.users VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.user_settings(user_id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
DO $$
BEGIN
  IF (SELECT recurrence_missed_alerts_enabled FROM public.user_settings LIMIT 1) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'New users must not be enrolled in missed-work alerts';
  END IF;
  IF (SELECT recurrence_missed_alert_threshold FROM public.user_settings LIMIT 1) <> 3 THEN
    RAISE EXCEPTION 'Unexpected missed-work default threshold';
  END IF;
END $$;

UPDATE public.user_settings
SET recurrence_missed_alerts_enabled = true, recurrence_missed_alert_threshold = 5;
DO $$
BEGIN
  IF (SELECT recurrence_missed_alert_threshold FROM public.user_settings LIMIT 1) <> 5
     OR (SELECT recurrence_missed_alerts_enabled FROM public.user_settings LIMIT 1) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Opt-in preference did not persist';
  END IF;
  BEGIN
    UPDATE public.user_settings SET recurrence_missed_alert_threshold=4;
    RAISE EXCEPTION 'Invalid missed threshold was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT 'recurrence-preferences-sql-passed' AS result;
SQL
