-- Phase 1 / Planner foundation: every canonical TipTap taskItem needs a stable identity.
--
-- Existing non-empty ids (including historical `legacy-*` ids) remain untouched so
-- deep links and client references keep working. Missing ids and duplicate ids inside
-- the same Action are replaced with deterministic UUIDs derived from task + JSON path.
-- Re-running this migration is safe.

BEGIN;

-- Backfilling editor metadata must not make old Actions look newly edited. The trigger
-- is restored automatically if the transaction aborts.
ALTER TABLE public.tasks DISABLE TRIGGER update_tasks_updated_at;

DO $$
DECLARE
  task_record record;
  item_record record;
  checklist_document jsonb;
  item_attrs jsonb;
  item_id text;
  replacement_id text;
  seen_ids text[];
  salt integer;
  missing_fixed bigint := 0;
  duplicate_fixed bigint := 0;
  tasks_updated bigint := 0;
  task_changed boolean;
  hash text;
BEGIN
  FOR task_record IN
    SELECT id, checklist_blocks
    FROM public.tasks
    WHERE checklist_blocks IS NOT NULL
      AND checklist_blocks <> 'null'::jsonb
    ORDER BY id
  LOOP
    IF jsonb_typeof(task_record.checklist_blocks) <> 'object'
       OR task_record.checklist_blocks->>'type' <> 'doc'
       OR jsonb_typeof(task_record.checklist_blocks->'content') <> 'array' THEN
      RAISE EXCEPTION
        'Checklist id preflight aborted: task % has invalid checklist_blocks',
        task_record.id;
    END IF;

    checklist_document := task_record.checklist_blocks;
    seen_ids := ARRAY[]::text[];
    task_changed := false;

    FOR item_record IN
      WITH RECURSIVE nodes(path, visit_path, node) AS (
        SELECT ARRAY[]::text[], ARRAY[]::integer[], task_record.checklist_blocks

        UNION ALL

        SELECT
          parent.path || ARRAY['content', (child.position - 1)::text],
          parent.visit_path || child.position::integer,
          child.node
        FROM nodes AS parent
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(parent.node->'content') = 'array'
              THEN parent.node->'content'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS child(node, position)
      )
      SELECT path, visit_path, node
      FROM nodes
      WHERE node->>'type' = 'taskItem'
      ORDER BY visit_path
    LOOP
      item_id := NULLIF(btrim(COALESCE(item_record.node->'attrs'->>'id', '')), '');

      IF item_id IS NULL OR item_id = ANY(seen_ids) THEN
        salt := 0;
        LOOP
          hash := md5(
            task_record.id::text || ':' ||
            array_to_string(item_record.visit_path, '.') || ':' ||
            salt::text || ':taskItem'
          );
          replacement_id := (
            substr(hash, 1, 8) || '-' ||
            substr(hash, 9, 4) || '-' ||
            substr(hash, 13, 4) || '-' ||
            substr(hash, 17, 4) || '-' ||
            substr(hash, 21, 12)
          )::uuid::text;
          EXIT WHEN NOT replacement_id = ANY(seen_ids);
          salt := salt + 1;
        END LOOP;

        IF item_id IS NULL THEN
          missing_fixed := missing_fixed + 1;
        ELSE
          duplicate_fixed := duplicate_fixed + 1;
        END IF;

        item_attrs := CASE
          WHEN jsonb_typeof(item_record.node->'attrs') = 'object'
            THEN item_record.node->'attrs'
          ELSE '{}'::jsonb
        END;
        checklist_document := jsonb_set(
          checklist_document,
          item_record.path || ARRAY['attrs'],
          item_attrs || jsonb_build_object('id', replacement_id),
          true
        );
        item_id := replacement_id;
        task_changed := true;
      END IF;

      seen_ids := array_append(seen_ids, item_id);
    END LOOP;

    IF task_changed THEN
      UPDATE public.tasks
      SET checklist_blocks = checklist_document
      WHERE id = task_record.id;
      tasks_updated := tasks_updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE
    'Checklist id normalization complete: tasks updated=%, missing ids fixed=%, duplicate ids fixed=%',
    tasks_updated,
    missing_fixed,
    duplicate_fixed;
END;
$$;

ALTER TABLE public.tasks ENABLE TRIGGER update_tasks_updated_at;

-- Fail fast if any taskItem remains unidentified or duplicated within its Action.
DO $$
DECLARE
  missing_count bigint;
  duplicate_count bigint;
  sample_task_ids uuid[];
BEGIN
  WITH RECURSIVE nodes(task_id, node) AS (
    SELECT id, checklist_blocks
    FROM public.tasks
    WHERE jsonb_typeof(checklist_blocks) = 'object'
      AND checklist_blocks->>'type' = 'doc'

    UNION ALL

    SELECT parent.task_id, child.node
    FROM nodes AS parent
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(parent.node->'content') = 'array'
          THEN parent.node->'content'
        ELSE '[]'::jsonb
      END
    ) AS child(node)
  ), task_items AS (
    SELECT task_id, NULLIF(btrim(COALESCE(node->'attrs'->>'id', '')), '') AS item_id
    FROM nodes
    WHERE node->>'type' = 'taskItem'
  ), duplicate_groups AS (
    SELECT task_id, item_id
    FROM task_items
    WHERE item_id IS NOT NULL
    GROUP BY task_id, item_id
    HAVING count(*) > 1
  ), bad_tasks AS (
    SELECT task_id FROM task_items WHERE item_id IS NULL
    UNION
    SELECT task_id FROM duplicate_groups
  )
  SELECT
    (SELECT count(*) FROM task_items WHERE item_id IS NULL),
    (SELECT count(*) FROM duplicate_groups),
    COALESCE(
      (SELECT array_agg(task_id ORDER BY task_id) FROM (SELECT DISTINCT task_id FROM bad_tasks LIMIT 10) sample),
      ARRAY[]::uuid[]
    )
  INTO missing_count, duplicate_count, sample_task_ids;

  IF missing_count > 0 OR duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Checklist id verification failed: missing=%, duplicate groups=%, sample task ids=%',
      missing_count,
      duplicate_count,
      sample_task_ids;
  END IF;

  RAISE NOTICE 'Checklist id verification passed: missing=0, duplicate groups=0';
END;
$$;

COMMIT;
