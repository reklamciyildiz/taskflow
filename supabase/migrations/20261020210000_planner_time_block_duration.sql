BEGIN;

ALTER TABLE public.work_schedules
  ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT;

ALTER TABLE public.work_schedules
  DROP CONSTRAINT IF EXISTS work_schedules_duration_minutes_check;

ALTER TABLE public.work_schedules
  ADD CONSTRAINT work_schedules_duration_minutes_check CHECK (
    duration_minutes IS NULL
    OR (
      schedule_time IS NOT NULL
      AND duration_minutes BETWEEN 5 AND 1440
    )
  );

COMMENT ON COLUMN public.work_schedules.duration_minutes IS
  'Optional time-block duration. NULL preserves legacy timed/all-day schedules without inventing an end time.';

COMMIT;
