-- Opt-in missed recurrence alerts, independent of delivery-channel preferences.
-- Existing users keep their current notification behavior until they enable this.
BEGIN;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS recurrence_missed_alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_missed_alert_threshold smallint NOT NULL DEFAULT 3;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_recurrence_missed_threshold_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_recurrence_missed_threshold_check
      CHECK (recurrence_missed_alert_threshold IN (2, 3, 5));
  END IF;
END $$;
COMMENT ON COLUMN public.user_settings.recurrence_missed_alerts_enabled
  IS 'Opt-in weekly-deduplicated in-app alerts for consecutively missed Action/Checklist recurrences.';
COMMENT ON COLUMN public.user_settings.recurrence_missed_alert_threshold
  IS 'Consecutive missed occurrences required before one weekly reminder (2,3,5).';
COMMIT;
