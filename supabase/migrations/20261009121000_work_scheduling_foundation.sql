-- Phase 1 / Planner domain foundation.
-- Adds the future canonical temporal model without reading, migrating or changing
-- any existing tasks.due_date/tasks.reminders/taskItem scheduling runtime behavior.

BEGIN;

CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  -- TEXT intentionally preserves stable historical `legacy-*` taskItem ids.
  -- New editor-created ids remain UUID strings.
  checklist_item_id TEXT,
  schedule_type TEXT NOT NULL
    CHECK (schedule_type IN ('one_off', 'recurring')),
  schedule_date DATE NOT NULL,
  schedule_time TIME WITHOUT TIME ZONE,
  time_zone TEXT,
  recurrence_frequency TEXT
    CHECK (recurrence_frequency IS NULL OR recurrence_frequency IN ('daily', 'weekly')),
  recurrence_interval SMALLINT NOT NULL DEFAULT 1
    CHECK (recurrence_interval >= 1),
  recurrence_weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[],
  ends_on DATE,
  reminder_rules JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(reminder_rules) = 'array'),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_schedules_time_pair_check CHECK (
    (schedule_time IS NULL AND time_zone IS NULL)
    OR (schedule_time IS NOT NULL AND time_zone IS NOT NULL)
  ),
  CONSTRAINT work_schedules_end_check CHECK (
    ends_on IS NULL OR ends_on >= schedule_date
  ),
  CONSTRAINT work_schedules_recurrence_shape_check CHECK (
    (
      schedule_type = 'one_off'
      AND recurrence_frequency IS NULL
      AND recurrence_interval = 1
      AND cardinality(recurrence_weekdays) = 0
      AND ends_on IS NULL
    )
    OR
    (
      schedule_type = 'recurring'
      AND recurrence_frequency IS NOT NULL
      AND (
        (recurrence_frequency = 'daily' AND cardinality(recurrence_weekdays) = 0)
        OR
        (recurrence_frequency = 'weekly' AND cardinality(recurrence_weekdays) > 0)
      )
    )
  )
);

-- At most one active schedule per canonical source. Archived schedules retain history
-- but no longer block a new active schedule.
CREATE UNIQUE INDEX work_schedules_one_active_action_idx
  ON public.work_schedules(task_id)
  WHERE checklist_item_id IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX work_schedules_one_active_checklist_idx
  ON public.work_schedules(task_id, checklist_item_id)
  WHERE checklist_item_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX work_schedules_scope_date_idx
  ON public.work_schedules(organization_id, team_id, schedule_date)
  WHERE archived_at IS NULL;

CREATE INDEX work_schedules_recurring_idx
  ON public.work_schedules(organization_id, team_id, schedule_date, ends_on)
  WHERE schedule_type = 'recurring' AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_work_schedule_scope_and_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_organization_id UUID;
  parent_team_id UUID;
  parent_checklist JSONB;
  checklist_match_count integer;
BEGIN
  SELECT organization_id, team_id, checklist_blocks
  INTO parent_organization_id, parent_team_id, parent_checklist
  FROM public.tasks
  WHERE id = NEW.task_id;

  IF parent_organization_id IS NULL OR parent_team_id IS NULL THEN
    RAISE EXCEPTION 'Parent Action not found for work schedule';
  END IF;

  -- Scope is always derived from the canonical parent; caller input cannot forge it.
  NEW.organization_id := parent_organization_id;
  NEW.team_id := parent_team_id;

  NEW.checklist_item_id := NULLIF(btrim(NEW.checklist_item_id), '');
  IF NEW.checklist_item_id IS NOT NULL THEN
    WITH RECURSIVE nodes(node) AS (
      SELECT parent_checklist

      UNION ALL

      SELECT child.node
      FROM nodes AS parent
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(parent.node->'content') = 'array'
            THEN parent.node->'content'
          ELSE '[]'::jsonb
        END
      ) AS child(node)
    )
    SELECT count(*)
    INTO checklist_match_count
    FROM nodes
    WHERE node->>'type' = 'taskItem'
      AND node->'attrs'->>'id' = NEW.checklist_item_id;

    IF checklist_match_count <> 1 THEN
      RAISE EXCEPTION
        'Checklist item % must exist exactly once in parent Action % (matches=%)',
        NEW.checklist_item_id,
        NEW.task_id,
        checklist_match_count;
    END IF;
  END IF;

  IF NEW.schedule_time IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone
  ) THEN
    RAISE EXCEPTION 'Invalid IANA time zone: %', NEW.time_zone;
  END IF;

  IF NEW.recurrence_frequency = 'weekly' THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(NEW.recurrence_weekdays) AS weekday(day)
      WHERE day IS NULL OR day < 1 OR day > 7
    ) THEN
      RAISE EXCEPTION 'recurrence_weekdays must contain ISO weekdays 1 through 7';
    END IF;

    SELECT COALESCE(array_agg(day ORDER BY day), ARRAY[]::SMALLINT[])
    INTO NEW.recurrence_weekdays
    FROM (
      SELECT DISTINCT unnest(NEW.recurrence_weekdays) AS day
    ) AS normalized
    WHERE day BETWEEN 1 AND 7;

    IF cardinality(NEW.recurrence_weekdays) = 0 THEN
      RAISE EXCEPTION 'Weekly recurrence requires at least one ISO weekday (1-7)';
    END IF;
  ELSIF cardinality(NEW.recurrence_weekdays) > 0 THEN
    RAISE EXCEPTION 'recurrence_weekdays is only valid for weekly recurrence';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_schedules_scope_and_validate
  BEFORE INSERT OR UPDATE ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_work_schedule_scope_and_validate();

CREATE TABLE public.work_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.work_schedules(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  effective_date DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  rescheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_occurrences_schedule_date_unique UNIQUE (schedule_id, occurrence_date),
  CONSTRAINT work_occurrences_completed_shape_check CHECK (
    (state = 'completed' AND completed_at IS NOT NULL)
    OR (state IN ('pending', 'skipped') AND completed_at IS NULL)
  ),
  CONSTRAINT work_occurrences_reschedule_shape_check CHECK (
    (effective_date = occurrence_date AND rescheduled_at IS NULL)
    OR (effective_date <> occurrence_date AND rescheduled_at IS NOT NULL)
  ),
  -- A normal pending occurrence is implicit. Persist pending only when the date was
  -- explicitly moved, so this table stays a sparse execution/exception history.
  CONSTRAINT work_occurrences_sparse_pending_check CHECK (
    state <> 'pending' OR effective_date <> occurrence_date
  )
);

CREATE INDEX work_occurrences_effective_date_idx
  ON public.work_occurrences(effective_date, schedule_id);

CREATE INDEX work_occurrences_state_idx
  ON public.work_occurrences(schedule_id, state, effective_date);

CREATE OR REPLACE FUNCTION public.work_schedule_matches_date(
  input_schedule_type TEXT,
  input_schedule_date DATE,
  input_ends_on DATE,
  input_frequency TEXT,
  input_interval SMALLINT,
  input_weekdays SMALLINT[],
  candidate_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN candidate_date < input_schedule_date THEN false
    WHEN input_ends_on IS NOT NULL AND candidate_date > input_ends_on THEN false
    WHEN input_schedule_type = 'one_off' THEN candidate_date = input_schedule_date
    WHEN input_schedule_type <> 'recurring' THEN false
    WHEN input_frequency = 'daily' THEN
      ((candidate_date - input_schedule_date) % input_interval) = 0
    WHEN input_frequency = 'weekly' THEN
      (((candidate_date - input_schedule_date) / 7) % input_interval) = 0
      AND extract(isodow FROM candidate_date)::SMALLINT = ANY(input_weekdays)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.validate_work_occurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  schedule_record public.work_schedules%ROWTYPE;
BEGIN
  SELECT * INTO schedule_record
  FROM public.work_schedules
  WHERE id = NEW.schedule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent work schedule not found';
  END IF;
  IF schedule_record.schedule_type <> 'recurring' THEN
    RAISE EXCEPTION 'Occurrences are only valid for recurring schedules';
  END IF;
  IF schedule_record.archived_at IS NOT NULL AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Cannot create an occurrence for an archived schedule';
  END IF;
  IF NOT public.work_schedule_matches_date(
    schedule_record.schedule_type,
    schedule_record.schedule_date,
    schedule_record.ends_on,
    schedule_record.recurrence_frequency,
    schedule_record.recurrence_interval,
    schedule_record.recurrence_weekdays,
    NEW.occurrence_date
  ) THEN
    RAISE EXCEPTION
      'Date % is not generated by recurring schedule %',
      NEW.occurrence_date,
      NEW.schedule_id;
  END IF;
  IF NEW.effective_date < schedule_record.schedule_date THEN
    RAISE EXCEPTION
      'Effective date % cannot precede schedule start date %',
      NEW.effective_date,
      schedule_record.schedule_date;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_occurrences_validate
  BEFORE INSERT OR UPDATE ON public.work_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_occurrence();

COMMENT ON TABLE public.work_schedules IS
  'Temporal metadata for canonical Actions and TipTap checklist items. Phase 1 is not connected to legacy due/reminder runtime.';
COMMENT ON COLUMN public.work_schedules.schedule_date IS
  'Timezone-free local calendar date; never convert this DATE through UTC.';
COMMENT ON COLUMN public.work_schedules.schedule_time IS
  'Optional local wall-clock time interpreted with time_zone.';
COMMENT ON COLUMN public.work_schedules.reminder_rules IS
  'Notification policy metadata derived from the schedule; not task date storage.';
COMMENT ON TABLE public.work_occurrences IS
  'Sparse state/exception rows for recurring schedules; pending future dates are computed, not pre-materialized.';

-- Match the current server-only data-access model. No direct JWT policies are
-- intentionally created; authenticated operations must pass through the scoped
-- server/domain service, while the service role bypasses RLS.
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_occurrences ENABLE ROW LEVEL SECURITY;

COMMIT;
