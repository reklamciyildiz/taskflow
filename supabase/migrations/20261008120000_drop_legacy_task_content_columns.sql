-- Final removal of task content columns superseded by checklist_blocks and notes.
--
-- This migration is intentionally fail-fast: any legacy-only content aborts the
-- transaction before the schema changes are reached.

BEGIN;

DO $$
DECLARE
  learning_source_count bigint;
  migrated_learning_count bigint;
  missing_learning_count bigint;
  missing_learning_task_ids uuid[];
  legacy_checklist_item_count bigint;
  covered_checklist_item_count bigint;
  missing_checklist_item_count bigint;
  missing_checklist_task_ids uuid[];
BEGIN
  WITH RECURSIVE legacy_learning_nodes (task_id, node) AS (
    SELECT task.id, task.learnings_blocks
    FROM public.tasks AS task
    WHERE jsonb_typeof(task.learnings_blocks) = 'object'
      AND task.learnings_blocks->>'type' = 'doc'
      AND jsonb_typeof(task.learnings_blocks->'content') = 'array'

    UNION ALL

    SELECT parent.task_id, child.node
    FROM legacy_learning_nodes AS parent
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(parent.node->'content') = 'array'
          THEN parent.node->'content'
        ELSE '[]'::jsonb
      END
    ) AS child(node)
  ),
  learning_sources AS (
    SELECT
      task.id AS task_id,
      task.organization_id,
      task.team_id,
      (
        substr(note_hash.value, 1, 8) || '-' ||
        substr(note_hash.value, 9, 4) || '-' ||
        substr(note_hash.value, 13, 4) || '-' ||
        substr(note_hash.value, 17, 4) || '-' ||
        substr(note_hash.value, 21, 12)
      )::uuid AS expected_note_id
    FROM public.tasks AS task
    CROSS JOIN LATERAL (
      SELECT md5('taskflow:legacy-learnings:v1:' || task.id::text) AS value
    ) AS note_hash
    WHERE COALESCE(task.learnings, '') !~ '^[[:space:]]*$'
       OR EXISTS (
         SELECT 1
         FROM legacy_learning_nodes AS block_node
         WHERE block_node.task_id = task.id
           AND (
             (
               block_node.node->>'type' = 'text'
               AND COALESCE(block_node.node->>'text', '') !~ '^[[:space:]]*$'
             )
             OR block_node.node->>'type' = 'horizontalRule'
           )
       )
  ),
  migrated_note_nodes (note_id, node) AS (
    SELECT note.id, note.content
    FROM public.notes AS note
    JOIN learning_sources AS source ON source.expected_note_id = note.id
    WHERE note.task_id = source.task_id
      AND note.organization_id = source.organization_id
      AND note.team_id = source.team_id
      AND note.type = 'learning'
      AND jsonb_typeof(note.content) = 'object'
      AND note.content->>'type' = 'doc'

    UNION ALL

    SELECT parent.note_id, child.node
    FROM migrated_note_nodes AS parent
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(parent.node->'content') = 'array'
          THEN parent.node->'content'
        ELSE '[]'::jsonb
      END
    ) AS child(node)
  ),
  meaningful_migrated_notes AS (
    SELECT DISTINCT note_id
    FROM migrated_note_nodes
    WHERE (
      node->>'type' = 'text'
      AND COALESCE(node->>'text', '') !~ '^[[:space:]]*$'
    )
       OR node->>'type' = 'horizontalRule'
  ),
  learning_validation AS (
    SELECT
      source.task_id,
      meaningful_note.note_id IS NOT NULL AS is_migrated
    FROM learning_sources AS source
    LEFT JOIN meaningful_migrated_notes AS meaningful_note
      ON meaningful_note.note_id = source.expected_note_id
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE is_migrated),
    count(*) FILTER (WHERE NOT is_migrated),
    COALESCE(
      (array_agg(task_id ORDER BY task_id) FILTER (WHERE NOT is_migrated))[1:10],
      ARRAY[]::uuid[]
    )
  INTO
    learning_source_count,
    migrated_learning_count,
    missing_learning_count,
    missing_learning_task_ids
  FROM learning_validation;

  IF missing_learning_count > 0 THEN
    RAISE EXCEPTION
      'Legacy column cleanup aborted: % Action(s) with meaningful Learnings lack their valid migrated Learning Note. Sample task ids: %',
      missing_learning_count,
      missing_learning_task_ids;
  END IF;

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
  canonical_checklist_items AS (
    SELECT DISTINCT
      task_id,
      NULLIF(node->'attrs'->>'id', '') AS item_id
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
    ) WITH ORDINALITY AS entry(value, position)
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
  checklist_validation AS (
    SELECT
      legacy.task_id,
      legacy.item_id,
      canonical.item_id IS NOT NULL AS is_covered
    FROM meaningful_legacy_items AS legacy
    LEFT JOIN canonical_checklist_items AS canonical
      ON canonical.task_id = legacy.task_id
     AND canonical.item_id = legacy.item_id
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE is_covered),
    count(*) FILTER (WHERE NOT is_covered),
    COALESCE(
      (array_agg(DISTINCT task_id ORDER BY task_id) FILTER (WHERE NOT is_covered))[1:10],
      ARRAY[]::uuid[]
    )
  INTO
    legacy_checklist_item_count,
    covered_checklist_item_count,
    missing_checklist_item_count,
    missing_checklist_task_ids
  FROM checklist_validation;

  IF missing_checklist_item_count > 0 THEN
    RAISE EXCEPTION
      'Legacy column cleanup aborted: % meaningful journal row(s) lack a canonical checklist_blocks taskItem. Sample task ids: %',
      missing_checklist_item_count,
      missing_checklist_task_ids;
  END IF;

  RAISE NOTICE
    'Legacy column cleanup preflight passed: Learnings sources=% migrated=%; legacy checklist rows=% covered=%',
    learning_source_count,
    migrated_learning_count,
    legacy_checklist_item_count,
    covered_checklist_item_count;
END;
$$;

ALTER TABLE public.tasks
  DROP COLUMN journal_logs,
  DROP COLUMN learnings,
  DROP COLUMN learnings_blocks;

COMMIT;
