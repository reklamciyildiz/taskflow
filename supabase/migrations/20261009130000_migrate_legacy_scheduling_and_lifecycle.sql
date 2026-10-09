-- Phase 2: migrate legacy Action/checklist scheduling into the canonical schedule model.
-- Legacy columns/attrs remain physically present, but runtime code no longer reads or writes
-- them as storage after this migration.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.try_timestamptz(value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN RETURN NULL; END IF;
  RETURN value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Historical clients used a few equivalent reminder shapes before the JSONB array
-- contract stabilized. Normalize only shapes whose meaning is unambiguous; leave any
-- unknown value untouched so the preflight below still fails instead of losing data.
CREATE OR REPLACE FUNCTION pg_temp.normalize_legacy_reminders(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  scalar_value text;
  object_value text;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(value) = 'array' THEN
    RETURN value;
  END IF;
  IF jsonb_typeof(value) = 'string' THEN
    scalar_value := btrim(value #>> '{}');
    IF scalar_value = '' OR lower(scalar_value) IN ('[]', 'null') THEN
      RETURN '[]'::jsonb;
    END IF;
    IF pg_temp.try_timestamptz(scalar_value) IS NOT NULL THEN
      RETURN jsonb_build_array(to_jsonb(scalar_value));
    END IF;
    RETURN value;
  END IF;
  IF jsonb_typeof(value) = 'object' THEN
    IF value = '{}'::jsonb THEN
      RETURN '[]'::jsonb;
    END IF;
    object_value := COALESCE(
      NULLIF(btrim(value->>'at'), ''),
      NULLIF(btrim(value->>'scheduledAt'), ''),
      NULLIF(btrim(value->>'reminderAt'), ''),
      NULLIF(btrim(value->>'date'), ''),
      NULLIF(btrim(value->>'datetime'), '')
    );
    IF object_value IS NOT NULL AND pg_temp.try_timestamptz(object_value) IS NOT NULL THEN
      RETURN jsonb_build_array(to_jsonb(object_value));
    END IF;
  END IF;
  RETURN value;
END;
$$;

CREATE TEMP TABLE legacy_schedule_raw (
  source_type text NOT NULL,
  task_id uuid NOT NULL,
  checklist_item_id text,
  organization_id uuid NOT NULL,
  team_id uuid NOT NULL,
  due_raw text,
  due_instant timestamptz,
  reminders jsonb NOT NULL,
  time_zone text NOT NULL
) ON COMMIT DROP;

-- Action sources.
INSERT INTO legacy_schedule_raw (
  source_type, task_id, checklist_item_id, organization_id, team_id,
  due_raw, due_instant, reminders, time_zone
)
SELECT
  'action',
  task.id,
  NULL,
  task.organization_id,
  task.team_id,
  task.due_date::text,
  task.due_date,
  pg_temp.normalize_legacy_reminders(task.reminders),
  COALESCE(
    (
      SELECT settings.time_zone
      FROM public.user_settings AS settings
      WHERE settings.user_id = COALESCE(task.assignee_id, task.created_by)
        AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = settings.time_zone)
      LIMIT 1
    ),
    'UTC'
  )
FROM public.tasks AS task
  WHERE task.due_date IS NOT NULL
   OR CASE
        WHEN jsonb_typeof(pg_temp.normalize_legacy_reminders(task.reminders)) = 'array'
          THEN jsonb_array_length(pg_temp.normalize_legacy_reminders(task.reminders)) > 0
        ELSE true
      END;

-- Checklist sources. Recursive traversal is position-independent and uses stable IDs only.
WITH RECURSIVE nodes AS (
  SELECT
    task.id AS task_id,
    task.organization_id,
    task.team_id,
    task.assignee_id AS task_assignee_id,
    task.created_by,
    task.checklist_blocks AS node
  FROM public.tasks AS task
  WHERE jsonb_typeof(task.checklist_blocks) = 'object'
    AND task.checklist_blocks->>'type' = 'doc'

  UNION ALL

  SELECT
    parent.task_id,
    parent.organization_id,
    parent.team_id,
    parent.task_assignee_id,
    parent.created_by,
    child.node
  FROM nodes AS parent
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(parent.node->'content') = 'array' THEN parent.node->'content'
      ELSE '[]'::jsonb
    END
  ) AS child(node)
), checklist_sources AS (
  SELECT
    task_id,
    organization_id,
    team_id,
    node->'attrs'->>'id' AS checklist_item_id,
    NULLIF(btrim(COALESCE(node->'attrs'->>'dueDate', '')), '') AS due_raw,
    pg_temp.normalize_legacy_reminders(node->'attrs'->'reminders') AS reminders,
    COALESCE(NULLIF(node->'attrs'->>'assigneeId', '')::uuid, task_assignee_id, created_by) AS recipient_id
  FROM nodes
  WHERE node->>'type' = 'taskItem'
)
INSERT INTO legacy_schedule_raw (
  source_type, task_id, checklist_item_id, organization_id, team_id,
  due_raw, due_instant, reminders, time_zone
)
SELECT
  'checklist_item',
  source.task_id,
  source.checklist_item_id,
  source.organization_id,
  source.team_id,
  source.due_raw,
  pg_temp.try_timestamptz(source.due_raw),
  source.reminders,
  COALESCE(
    (
      SELECT settings.time_zone
      FROM public.user_settings AS settings
      WHERE settings.user_id = source.recipient_id
        AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = settings.time_zone)
      LIMIT 1
    ),
    'UTC'
  )
FROM checklist_sources AS source
WHERE source.due_raw IS NOT NULL
   OR (jsonb_typeof(source.reminders) = 'array' AND jsonb_array_length(source.reminders) > 0)
   OR jsonb_typeof(source.reminders) <> 'array';

-- Fail-fast preflight. Do not silently discard invalid/ambiguous source associations.
DO $$
DECLARE
  action_due_count bigint;
  action_reminder_count bigint;
  checklist_due_count bigint;
  checklist_reminder_count bigint;
  missing_id_count bigint;
  duplicate_id_count bigint;
  invalid_reminder_shape_count bigint;
  invalid_reminder_samples text[];
  reminder_without_due_count bigint;
  blocking_reminder_without_due_count bigint;
  reminder_without_due_samples text[];
  stale_reminder_without_due_samples text[];
  invalid_due_count bigint;
  invalid_reminder_count bigint;
BEGIN
  SELECT
    count(*) FILTER (WHERE source_type = 'action' AND due_raw IS NOT NULL),
    count(*) FILTER (
      WHERE source_type = 'action'
        AND CASE WHEN jsonb_typeof(reminders) = 'array' THEN jsonb_array_length(reminders) > 0 ELSE false END
    ),
    count(*) FILTER (WHERE source_type = 'checklist_item' AND due_raw IS NOT NULL),
    count(*) FILTER (
      WHERE source_type = 'checklist_item'
        AND CASE WHEN jsonb_typeof(reminders) = 'array' THEN jsonb_array_length(reminders) > 0 ELSE false END
    ),
    count(*) FILTER (WHERE source_type = 'checklist_item' AND NULLIF(btrim(COALESCE(checklist_item_id, '')), '') IS NULL),
    count(*) FILTER (WHERE jsonb_typeof(reminders) <> 'array'),
    count(*) FILTER (
      WHERE due_raw IS NULL
        AND CASE WHEN jsonb_typeof(reminders) = 'array' THEN jsonb_array_length(reminders) > 0 ELSE false END
    ),
    count(*) FILTER (
      WHERE due_raw IS NOT NULL
        AND due_raw !~ '^\d{4}-\d{2}-\d{2}$'
        AND due_instant IS NULL
    )
  INTO
    action_due_count,
    action_reminder_count,
    checklist_due_count,
    checklist_reminder_count,
    missing_id_count,
    invalid_reminder_shape_count,
    reminder_without_due_count,
    invalid_due_count
  FROM legacy_schedule_raw;

  -- Re-audit every taskItem, not only scheduled items, so scheduling never adopts an
  -- unstable identity created by a stale client after Phase 1.
  WITH RECURSIVE nodes(task_id, node) AS (
    SELECT id, checklist_blocks
    FROM public.tasks
    WHERE jsonb_typeof(checklist_blocks) = 'object'
      AND checklist_blocks->>'type' = 'doc'
    UNION ALL
    SELECT parent.task_id, child.node
    FROM nodes AS parent
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(parent.node->'content') = 'array' THEN parent.node->'content' ELSE '[]'::jsonb END
    ) AS child(node)
  ), items AS (
    SELECT task_id, NULLIF(btrim(COALESCE(node->'attrs'->>'id', '')), '') AS item_id
    FROM nodes
    WHERE node->>'type' = 'taskItem'
  ), duplicates AS (
    SELECT task_id, item_id
    FROM items
    WHERE item_id IS NOT NULL
    GROUP BY task_id, item_id
    HAVING count(*) > 1
  )
  SELECT
    (SELECT count(*) FROM items WHERE item_id IS NULL),
    (SELECT count(*) FROM duplicates)
  INTO missing_id_count, duplicate_id_count;

  SELECT count(*) INTO invalid_reminder_count
  FROM legacy_schedule_raw AS source
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(source.reminders) = 'array' THEN source.reminders ELSE '[]'::jsonb END
  ) AS reminder(value)
  WHERE jsonb_typeof(reminder.value) <> 'string'
     OR pg_temp.try_timestamptz(reminder.value #>> '{}') IS NULL;

  SELECT count(*)
  INTO blocking_reminder_without_due_count
  FROM legacy_schedule_raw AS source
  WHERE source.due_raw IS NULL
    AND jsonb_typeof(source.reminders) = 'array'
    AND jsonb_array_length(source.reminders) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(source.reminders) AS reminder(value)
      WHERE pg_temp.try_timestamptz(reminder.value #>> '{}') >= now() - interval '24 hours'
    );

  SELECT COALESCE(
    array_agg(sample ORDER BY sample),
    ARRAY[]::text[]
  )
  INTO invalid_reminder_samples
  FROM (
    SELECT
      source_type || ':' || task_id::text || ':' || COALESCE(checklist_item_id, '')
      || ' type=' || COALESCE(jsonb_typeof(reminders), 'sql-null')
      || ' value=' || left(reminders::text, 160) AS sample
    FROM legacy_schedule_raw
    WHERE jsonb_typeof(reminders) <> 'array'
    ORDER BY task_id, checklist_item_id
    LIMIT 10
  ) AS invalid_samples;

  SELECT COALESCE(
    array_agg(sample ORDER BY sample),
    ARRAY[]::text[]
  )
  INTO reminder_without_due_samples
  FROM (
    SELECT
      source_type || ':' || task_id::text || ':' || COALESCE(checklist_item_id, '')
      || ' reminders=' || left(reminders::text, 240) AS sample
    FROM legacy_schedule_raw
    WHERE due_raw IS NULL
      AND jsonb_typeof(reminders) = 'array'
      AND jsonb_array_length(reminders) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(reminders) AS reminder(value)
        WHERE pg_temp.try_timestamptz(reminder.value #>> '{}') >= now() - interval '24 hours'
      )
    ORDER BY task_id, checklist_item_id
    LIMIT 10
  ) AS reminder_only_samples;

  SELECT COALESCE(
    array_agg(sample ORDER BY sample),
    ARRAY[]::text[]
  )
  INTO stale_reminder_without_due_samples
  FROM (
    SELECT
      source_type || ':' || task_id::text || ':' || COALESCE(checklist_item_id, '')
      || ' reminders=' || left(reminders::text, 240) AS sample
    FROM legacy_schedule_raw
    WHERE due_raw IS NULL
      AND jsonb_typeof(reminders) = 'array'
      AND jsonb_array_length(reminders) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(reminders) AS reminder(value)
        WHERE pg_temp.try_timestamptz(reminder.value #>> '{}') >= now() - interval '24 hours'
      )
    ORDER BY task_id, checklist_item_id
    LIMIT 10
  ) AS stale_reminder_only_samples;

  RAISE NOTICE
    'Legacy scheduling preflight: action due=%, action reminders=%, checklist due=%, checklist reminders=%',
    action_due_count, action_reminder_count, checklist_due_count, checklist_reminder_count;

  IF missing_id_count > 0 OR duplicate_id_count > 0 THEN
    RAISE EXCEPTION
      'Legacy scheduling migration aborted: checklist stable IDs invalid (missing=%, duplicate source groups=%)',
      missing_id_count, duplicate_id_count;
  END IF;
  IF invalid_reminder_shape_count > 0 OR invalid_reminder_count > 0 THEN
    RAISE EXCEPTION
      'Legacy scheduling migration aborted: invalid reminder data (non-array sources=%, invalid instants=%). Samples=%',
      invalid_reminder_shape_count, invalid_reminder_count, invalid_reminder_samples;
  END IF;
  IF blocking_reminder_without_due_count > 0 THEN
    RAISE EXCEPTION
      'Legacy scheduling migration aborted: % source(s) have reminders but no due date. Samples=%',
      blocking_reminder_without_due_count, reminder_without_due_samples;
  END IF;
  IF reminder_without_due_count > 0 THEN
    RAISE NOTICE
      'Legacy scheduling preflight: % stale reminder-only source(s) are older than the 24-hour delivery window and will not become schedules. Legacy values remain untouched. Samples=%',
      reminder_without_due_count, stale_reminder_without_due_samples;
  END IF;
  IF invalid_due_count > 0 THEN
    RAISE EXCEPTION
      'Legacy scheduling migration aborted: % invalid due date value(s)',
      invalid_due_count;
  END IF;
END;
$$;

CREATE TEMP TABLE legacy_schedule_candidates ON COMMIT DROP AS
SELECT
  source.source_type,
  source.task_id,
  source.checklist_item_id,
  source.organization_id,
  source.team_id,
  CASE
    WHEN source.due_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN source.due_raw::date
    WHEN source.due_raw ~ '^\d{4}-\d{2}-\d{2}[T ]00:00:00(?:\.\d{1,9})?(?:Z|[+]00(?::?00)?)$'
      THEN substring(source.due_raw FROM 1 FOR 10)::date
    WHEN (source.due_instant AT TIME ZONE source.time_zone)::time(0) = time '12:00:00'
      THEN (source.due_instant AT TIME ZONE source.time_zone)::date
    ELSE (source.due_instant AT TIME ZONE source.time_zone)::date
  END AS schedule_date,
  CASE
    WHEN source.due_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN NULL::time
    WHEN source.due_raw ~ '^\d{4}-\d{2}-\d{2}[T ]00:00:00(?:\.\d{1,9})?(?:Z|[+]00(?::?00)?)$' THEN NULL::time
    WHEN (source.due_instant AT TIME ZONE source.time_zone)::time(0) = time '12:00:00' THEN NULL::time
    ELSE (source.due_instant AT TIME ZONE source.time_zone)::time(0)
  END AS schedule_time,
  CASE
    WHEN source.due_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN NULL::text
    WHEN source.due_raw ~ '^\d{4}-\d{2}-\d{2}[T ]00:00:00(?:\.\d{1,9})?(?:Z|[+]00(?::?00)?)$' THEN NULL::text
    WHEN (source.due_instant AT TIME ZONE source.time_zone)::time(0) = time '12:00:00' THEN NULL::text
    ELSE source.time_zone
  END AS time_zone,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', 'absolute',
          'at', to_char(
            pg_temp.try_timestamptz(reminder.value #>> '{}') AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ) || CASE
          WHEN pg_temp.try_timestamptz(reminder.value #>> '{}') = source.due_instant
            THEN jsonb_build_object('preset', 'when_due')
          ELSE '{}'::jsonb
        END
        ORDER BY pg_temp.try_timestamptz(reminder.value #>> '{}')
      )
      FROM jsonb_array_elements(source.reminders) AS reminder(value)
    ),
    '[]'::jsonb
  ) AS reminder_rules
FROM legacy_schedule_raw AS source
WHERE source.due_raw IS NOT NULL;

-- An existing active schedule is allowed only when it exactly matches this migration.
DO $$
DECLARE
  conflict_count bigint;
  sample_sources text[];
BEGIN
  WITH conflicts AS (
    SELECT
      candidate.source_type || ':' || candidate.task_id::text || ':' || COALESCE(candidate.checklist_item_id, '') AS source_key
    FROM legacy_schedule_candidates AS candidate
    JOIN public.work_schedules AS schedule
      ON schedule.task_id = candidate.task_id
     AND schedule.checklist_item_id IS NOT DISTINCT FROM candidate.checklist_item_id
     AND schedule.archived_at IS NULL
    WHERE schedule.schedule_type <> 'one_off'
       OR schedule.schedule_date <> candidate.schedule_date
       OR schedule.schedule_time IS DISTINCT FROM candidate.schedule_time
       OR schedule.time_zone IS DISTINCT FROM candidate.time_zone
       OR schedule.reminder_rules <> candidate.reminder_rules
  )
  SELECT
    (SELECT count(*) FROM conflicts),
    COALESCE(
      (SELECT array_agg(source_key ORDER BY source_key) FROM (SELECT source_key FROM conflicts LIMIT 10) AS sample),
      ARRAY[]::text[]
    )
  INTO conflict_count, sample_sources
  ;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION
      'Legacy scheduling migration aborted: % canonical schedule conflict(s). Sample sources=%',
      conflict_count, sample_sources;
  END IF;
END;
$$;

INSERT INTO public.work_schedules (
  organization_id,
  team_id,
  task_id,
  checklist_item_id,
  schedule_type,
  schedule_date,
  schedule_time,
  time_zone,
  recurrence_frequency,
  recurrence_interval,
  recurrence_weekdays,
  ends_on,
  reminder_rules
)
SELECT
  candidate.organization_id,
  candidate.team_id,
  candidate.task_id,
  candidate.checklist_item_id,
  'one_off',
  candidate.schedule_date,
  candidate.schedule_time,
  candidate.time_zone,
  NULL,
  1,
  ARRAY[]::smallint[],
  NULL,
  candidate.reminder_rules
FROM legacy_schedule_candidates AS candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM public.work_schedules AS existing
  WHERE existing.task_id = candidate.task_id
    AND existing.checklist_item_id IS NOT DISTINCT FROM candidate.checklist_item_id
    AND existing.archived_at IS NULL
);

DO $$
DECLARE
  action_candidate_count bigint;
  checklist_candidate_count bigint;
  action_migrated_count bigint;
  checklist_migrated_count bigint;
  reminder_source_count bigint;
  reminder_rule_count bigint;
  mismatch_count bigint;
  orphan_count bigint;
  scope_mismatch_count bigint;
  ambiguous_date_only_count bigint;
BEGIN
  SELECT
    count(*) FILTER (WHERE source_type = 'action'),
    count(*) FILTER (WHERE source_type = 'checklist_item'),
    count(*) FILTER (WHERE jsonb_array_length(reminder_rules) > 0),
    COALESCE(sum(jsonb_array_length(reminder_rules)), 0)
  INTO action_candidate_count, checklist_candidate_count, reminder_source_count, reminder_rule_count
  FROM legacy_schedule_candidates;

  SELECT
    count(*) FILTER (WHERE candidate.source_type = 'action'),
    count(*) FILTER (WHERE candidate.source_type = 'checklist_item')
  INTO action_migrated_count, checklist_migrated_count
  FROM legacy_schedule_candidates AS candidate
  JOIN public.work_schedules AS schedule
    ON schedule.task_id = candidate.task_id
   AND schedule.checklist_item_id IS NOT DISTINCT FROM candidate.checklist_item_id
   AND schedule.archived_at IS NULL
   AND schedule.schedule_type = 'one_off'
   AND schedule.schedule_date = candidate.schedule_date
   AND schedule.schedule_time IS NOT DISTINCT FROM candidate.schedule_time
   AND schedule.time_zone IS NOT DISTINCT FROM candidate.time_zone
   AND schedule.reminder_rules = candidate.reminder_rules;

  SELECT count(*) INTO mismatch_count
  FROM legacy_schedule_candidates AS candidate
  WHERE NOT EXISTS (
    SELECT 1 FROM public.work_schedules AS schedule
    WHERE schedule.task_id = candidate.task_id
      AND schedule.checklist_item_id IS NOT DISTINCT FROM candidate.checklist_item_id
      AND schedule.archived_at IS NULL
      AND schedule.schedule_type = 'one_off'
      AND schedule.schedule_date = candidate.schedule_date
      AND schedule.schedule_time IS NOT DISTINCT FROM candidate.schedule_time
      AND schedule.time_zone IS NOT DISTINCT FROM candidate.time_zone
      AND schedule.reminder_rules = candidate.reminder_rules
  );

  SELECT count(*) INTO orphan_count
  FROM public.work_schedules AS schedule
  LEFT JOIN public.tasks AS task ON task.id = schedule.task_id
  WHERE schedule.archived_at IS NULL
    AND (
      task.id IS NULL
      OR (
        schedule.checklist_item_id IS NOT NULL
        AND NOT EXISTS (
          WITH RECURSIVE nodes(node) AS (
            SELECT task.checklist_blocks
            UNION ALL
            SELECT child.node
            FROM nodes AS parent
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(parent.node->'content') = 'array' THEN parent.node->'content' ELSE '[]'::jsonb END
            ) AS child(node)
          )
          SELECT 1 FROM nodes
          WHERE node->>'type' = 'taskItem'
            AND node->'attrs'->>'id' = schedule.checklist_item_id
        )
      )
    );

  SELECT count(*) INTO scope_mismatch_count
  FROM public.work_schedules AS schedule
  JOIN public.tasks AS task ON task.id = schedule.task_id
  WHERE schedule.organization_id <> task.organization_id
     OR schedule.team_id <> task.team_id;

  SELECT count(*) INTO ambiguous_date_only_count
  FROM legacy_schedule_raw
  WHERE due_raw IS NOT NULL
    AND due_raw !~ '^\d{4}-\d{2}-\d{2}$'
    AND due_raw !~ '^\d{4}-\d{2}-\d{2}[T ]00:00:00(?:\.\d{1,9})?(?:Z|[+]00(?::?00)?)$'
    AND (due_instant AT TIME ZONE time_zone)::time(0) = time '12:00:00';

  IF mismatch_count > 0 OR orphan_count > 0 OR scope_mismatch_count > 0
     OR action_candidate_count <> action_migrated_count
     OR checklist_candidate_count <> checklist_migrated_count THEN
    RAISE EXCEPTION
      'Legacy scheduling reconciliation failed: source mismatches=%, orphans=%, scope mismatches=%, action=%/%, checklist=%/%',
      mismatch_count, orphan_count, scope_mismatch_count,
      action_migrated_count, action_candidate_count,
      checklist_migrated_count, checklist_candidate_count;
  END IF;

  RAISE NOTICE
    'Legacy scheduling migration verified: action schedules=%, checklist schedules=%, reminder sources=%, reminder rules=%, noon-as-date-only=%',
    action_migrated_count, checklist_migrated_count, reminder_source_count, reminder_rule_count, ambiguous_date_only_count;
END;
$$;

-- A deleted checklist node retires its schedule. Occurrence history stays attached to
-- the archived schedule, so it is retained but can no longer generate future work.
CREATE OR REPLACE FUNCTION public.retire_removed_checklist_schedules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.work_schedules AS schedule
  SET archived_at = now(), updated_at = now()
  WHERE schedule.task_id = NEW.id
    AND schedule.checklist_item_id IS NOT NULL
    AND schedule.archived_at IS NULL
    AND NOT EXISTS (
      WITH RECURSIVE nodes(node) AS (
        SELECT NEW.checklist_blocks
        UNION ALL
        SELECT child.node
        FROM nodes AS parent
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(parent.node->'content') = 'array' THEN parent.node->'content' ELSE '[]'::jsonb END
        ) AS child(node)
      )
      SELECT 1
      FROM nodes
      WHERE node->>'type' = 'taskItem'
        AND node->'attrs'->>'id' = schedule.checklist_item_id
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_retire_removed_checklist_schedules ON public.tasks;
CREATE TRIGGER tasks_retire_removed_checklist_schedules
  BEFORE UPDATE OF checklist_blocks ON public.tasks
  FOR EACH ROW
  WHEN (OLD.checklist_blocks IS DISTINCT FROM NEW.checklist_blocks)
  EXECUTE FUNCTION public.retire_removed_checklist_schedules();

-- Scope follows the canonical parent if an administrative workflow ever moves an Action.
CREATE OR REPLACE FUNCTION public.rescope_work_schedules_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.work_schedules
  SET organization_id = NEW.organization_id, team_id = NEW.team_id, updated_at = now()
  WHERE task_id = NEW.id
    AND (organization_id <> NEW.organization_id OR team_id <> NEW.team_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_rescope_work_schedules ON public.tasks;
CREATE TRIGGER tasks_rescope_work_schedules
  AFTER UPDATE OF organization_id, team_id ON public.tasks
  FOR EACH ROW
  WHEN (OLD.organization_id IS DISTINCT FROM NEW.organization_id OR OLD.team_id IS DISTINCT FROM NEW.team_id)
  EXECUTE FUNCTION public.rescope_work_schedules_from_task();

COMMIT;
