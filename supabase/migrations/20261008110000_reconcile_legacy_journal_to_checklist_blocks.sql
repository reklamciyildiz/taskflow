-- Reconcile meaningful checklist rows that exist only in tasks.journal_logs.
--
-- This migration intentionally runs before the final legacy-column DROP migration.
-- It preserves every valid canonical TipTap node and appends only missing taskItems.
-- Invalid non-null checklist_blocks documents abort the transaction rather than
-- being overwritten. Re-running the migration is safe.

BEGIN;

DO $$
DECLARE
  task_record record;
  entry_record record;
  checklist_document jsonb;
  normalized_journal jsonb;
  normalized_entry jsonb;
  missing_items jsonb;
  item_id text;
  item_text text;
  item_assignee text;
  item_due_date text;
  item_reminders jsonb;
  is_meaningful boolean;
  is_placeholder boolean;
  item_exists boolean;
  journal_changed boolean;
  migrated_item_count bigint := 0;
  reconciled_task_count bigint := 0;
BEGIN
  FOR task_record IN
    SELECT task.id, task.journal_logs, task.checklist_blocks
    FROM public.tasks AS task
    WHERE jsonb_typeof(task.journal_logs) = 'array'
      AND jsonb_array_length(task.journal_logs) > 0
    ORDER BY task.id
  LOOP
    IF task_record.checklist_blocks IS NULL
       OR task_record.checklist_blocks = 'null'::jsonb THEN
      checklist_document := jsonb_build_object(
        'type', 'doc',
        'content', '[]'::jsonb
      );
    ELSIF jsonb_typeof(task_record.checklist_blocks) = 'object'
       AND task_record.checklist_blocks->>'type' = 'doc'
       AND jsonb_typeof(task_record.checklist_blocks->'content') = 'array' THEN
      checklist_document := task_record.checklist_blocks;
    ELSE
      RAISE EXCEPTION
        'Legacy checklist reconciliation aborted: task % has invalid non-null checklist_blocks',
        task_record.id;
    END IF;

    normalized_journal := '[]'::jsonb;
    missing_items := '[]'::jsonb;
    journal_changed := false;

    FOR entry_record IN
      SELECT entry.value, entry.position
      FROM jsonb_array_elements(task_record.journal_logs)
        WITH ORDINALITY AS entry(value, position)
      ORDER BY entry.position
    LOOP
      normalized_entry := entry_record.value;

      IF jsonb_typeof(entry_record.value) <> 'object' THEN
        normalized_journal := normalized_journal || jsonb_build_array(normalized_entry);
        CONTINUE;
      END IF;

      item_text := COALESCE(entry_record.value->>'text', '');
      item_assignee := NULLIF(
        COALESCE(entry_record.value->>'assignee_id', entry_record.value->>'assigneeId', ''),
        ''
      );
      item_due_date := NULLIF(
        COALESCE(entry_record.value->>'due_date', entry_record.value->>'dueDate', ''),
        ''
      );
      item_reminders := CASE
        WHEN jsonb_typeof(entry_record.value->'reminders') = 'array'
          THEN entry_record.value->'reminders'
        ELSE '[]'::jsonb
      END;
      item_id := NULLIF(COALESCE(entry_record.value->>'id', ''), '');
      is_placeholder := COALESCE(item_id, '') = 'QUICK_ROW_ADD_NEW'
        OR left(COALESCE(item_id, ''), 2) = '__';
      is_meaningful := item_text !~ '^[[:space:]]*$'
        OR entry_record.value->>'done' = 'true'
        OR item_assignee IS NOT NULL
        OR item_due_date IS NOT NULL
        OR jsonb_array_length(item_reminders) > 0;

      IF is_meaningful AND NOT is_placeholder AND item_id IS NULL THEN
        item_id := 'legacy-' || md5(
          task_record.id::text || ':' ||
          entry_record.position::text || ':' ||
          item_text
        );
        normalized_entry := jsonb_set(
          normalized_entry,
          '{id}',
          to_jsonb(item_id),
          true
        );
        journal_changed := true;
      END IF;

      normalized_journal := normalized_journal || jsonb_build_array(normalized_entry);

      IF NOT is_meaningful OR is_placeholder OR item_id IS NULL THEN
        CONTINUE;
      END IF;

      WITH RECURSIVE nodes (node) AS (
        SELECT checklist_document

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
      SELECT EXISTS (
        SELECT 1
        FROM nodes
        WHERE node->>'type' = 'taskItem'
          AND node->'attrs'->>'id' = item_id
      )
      INTO item_exists;

      IF NOT item_exists AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(missing_items) AS pending(item)
        WHERE pending.item->'attrs'->>'id' = item_id
      ) THEN
        missing_items := missing_items || jsonb_build_array(
          jsonb_build_object(
            'type', 'taskItem',
            'attrs', jsonb_build_object(
              'checked', entry_record.value->>'done' = 'true',
              'id', item_id,
              'assigneeId', item_assignee,
              'dueDate', item_due_date,
              'reminders', item_reminders
            ),
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'paragraph',
                'content', CASE
                  WHEN item_text !~ '^[[:space:]]*$' THEN jsonb_build_array(
                    jsonb_build_object('type', 'text', 'text', item_text)
                  )
                  ELSE '[]'::jsonb
                END
              )
            )
          )
        );
      END IF;
    END LOOP;

    IF jsonb_array_length(missing_items) > 0 THEN
      checklist_document := jsonb_set(
        checklist_document,
        '{content}',
        checklist_document->'content' || jsonb_build_array(
          jsonb_build_object(
            'type', 'taskList',
            'content', missing_items
          )
        ),
        false
      );
      migrated_item_count := migrated_item_count + jsonb_array_length(missing_items);
      reconciled_task_count := reconciled_task_count + 1;
    END IF;

    IF jsonb_array_length(missing_items) > 0 OR journal_changed THEN
      UPDATE public.tasks
      SET
        checklist_blocks = checklist_document,
        journal_logs = normalized_journal
      WHERE id = task_record.id;
    END IF;
  END LOOP;

  RAISE NOTICE
    'Legacy checklist reconciliation complete: tasks updated=%, taskItems appended=%',
    reconciled_task_count,
    migrated_item_count;
END;
$$;

-- Independent verification: every meaningful non-placeholder legacy row must
-- now have a canonical TipTap taskItem with the same stable id.
DO $$
DECLARE
  missing_count bigint;
  missing_task_ids uuid[];
BEGIN
  WITH RECURSIVE checklist_nodes (task_id, node) AS (
    SELECT task.id, task.checklist_blocks
    FROM public.tasks AS task
    WHERE jsonb_typeof(task.checklist_blocks) = 'object'
      AND task.checklist_blocks->>'type' = 'doc'

    UNION ALL

    SELECT parent.task_id, child.node
    FROM checklist_nodes AS parent
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(parent.node->'content') = 'array'
          THEN parent.node->'content'
        ELSE '[]'::jsonb
      END
    ) AS child(node)
  ),
  canonical_items AS (
    SELECT DISTINCT task_id, node->'attrs'->>'id' AS item_id
    FROM checklist_nodes
    WHERE node->>'type' = 'taskItem'
      AND NULLIF(node->'attrs'->>'id', '') IS NOT NULL
  ),
  meaningful_legacy_items AS (
    SELECT
      task.id AS task_id,
      NULLIF(COALESCE(entry.value->>'id', ''), '') AS item_id
    FROM public.tasks AS task
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(task.journal_logs) = 'array'
          THEN task.journal_logs
        ELSE '[]'::jsonb
      END
    ) AS entry(value)
    WHERE jsonb_typeof(entry.value) = 'object'
      AND COALESCE(entry.value->>'id', '') <> 'QUICK_ROW_ADD_NEW'
      AND left(COALESCE(entry.value->>'id', ''), 2) <> '__'
      AND (
        COALESCE(entry.value->>'text', '') !~ '^[[:space:]]*$'
        OR entry.value->>'done' = 'true'
        OR NULLIF(COALESCE(entry.value->>'assignee_id', entry.value->>'assigneeId', ''), '') IS NOT NULL
        OR NULLIF(COALESCE(entry.value->>'due_date', entry.value->>'dueDate', ''), '') IS NOT NULL
        OR jsonb_array_length(
          CASE
            WHEN jsonb_typeof(entry.value->'reminders') = 'array'
              THEN entry.value->'reminders'
            ELSE '[]'::jsonb
          END
        ) > 0
      )
  ),
  missing_items AS (
    SELECT legacy.task_id
    FROM meaningful_legacy_items AS legacy
    LEFT JOIN canonical_items AS canonical
      ON canonical.task_id = legacy.task_id
     AND canonical.item_id = legacy.item_id
    WHERE legacy.item_id IS NULL OR canonical.item_id IS NULL
  )
  SELECT
    count(*),
    COALESCE(
      (array_agg(DISTINCT task_id ORDER BY task_id))[1:10],
      ARRAY[]::uuid[]
    )
  INTO missing_count, missing_task_ids
  FROM missing_items;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Legacy checklist reconciliation verification failed: % row(s) remain uncovered. Sample task ids: %',
      missing_count,
      missing_task_ids;
  END IF;

  RAISE NOTICE 'Legacy checklist reconciliation verification passed: uncovered rows=0';
END;
$$;

COMMIT;
