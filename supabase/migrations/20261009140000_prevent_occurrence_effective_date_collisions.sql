BEGIN;

DO $$
DECLARE
  duplicate_count integer;
  samples text;
BEGIN
  SELECT count(*)
  INTO duplicate_count
  FROM (
    SELECT schedule_id, effective_date
    FROM public.work_occurrences
    GROUP BY schedule_id, effective_date
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    SELECT string_agg(format('%s:%s', schedule_id, effective_date), ', ')
    INTO samples
    FROM (
      SELECT schedule_id, effective_date
      FROM public.work_occurrences
      GROUP BY schedule_id, effective_date
      HAVING count(*) > 1
      ORDER BY effective_date, schedule_id
      LIMIT 10
    ) duplicate_samples;

    RAISE EXCEPTION
      'Occurrence collision guard aborted: % schedule/effective-date collision(s). Samples: %',
      duplicate_count,
      coalesce(samples, 'none');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS work_occurrences_schedule_effective_date_unique_idx
  ON public.work_occurrences(schedule_id, effective_date);

COMMENT ON INDEX public.work_occurrences_schedule_effective_date_unique_idx IS
  'Prevents two persisted recurrence origins from resolving to the same Planner date.';

COMMIT;
