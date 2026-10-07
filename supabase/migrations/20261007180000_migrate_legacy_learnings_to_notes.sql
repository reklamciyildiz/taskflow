-- Copy each action's existing Learnings document into one independent Learning Note.
--
-- Safety properties:
--   * tasks.learnings and tasks.learnings_blocks remain unchanged.
--   * Existing user-created notes are never updated or deleted.
--   * A deterministic note UUID per task makes this migration idempotent.
--   * The whole migration rolls back if an author cannot be resolved or a UUID
--     collision is detected.

BEGIN;

CREATE TEMP TABLE legacy_learning_note_candidates ON COMMIT DROP AS
WITH RECURSIVE valid_block_nodes (task_id, node) AS (
  SELECT
    task.id,
    task.learnings_blocks
  FROM tasks AS task
  WHERE jsonb_typeof(task.learnings_blocks) = 'object'
    AND task.learnings_blocks->>'type' = 'doc'
    AND jsonb_typeof(task.learnings_blocks->'content') = 'array'

  UNION ALL

  SELECT
    parent.task_id,
    child.node
  FROM valid_block_nodes AS parent
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(parent.node->'content') = 'array'
        THEN parent.node->'content'
      ELSE '[]'::jsonb
    END
  ) AS child(node)
),
source_tasks AS (
  SELECT
    task.*,
    EXISTS (
      SELECT 1
      FROM valid_block_nodes AS block_node
      WHERE block_node.task_id = task.id
        AND (
          (
            block_node.node->>'type' = 'text'
            AND COALESCE(block_node.node->>'text', '') !~ '^[[:space:]]*$'
          )
          OR block_node.node->>'type' = 'horizontalRule'
        )
    ) AS has_meaningful_blocks
  FROM tasks AS task
),
prepared AS (
  SELECT
    task.id AS task_id,
    task.organization_id,
    task.team_id,
    COALESCE(
      (
        SELECT app_user.id
        FROM users AS app_user
        WHERE app_user.id = task.created_by
          AND app_user.organization_id = task.organization_id
      ),
      (
        SELECT app_user.id
        FROM users AS app_user
        WHERE app_user.id = task.assignee_id
          AND app_user.organization_id = task.organization_id
      ),
      (
        SELECT app_user.id
        FROM team_members AS membership
        JOIN users AS app_user ON app_user.id = membership.user_id
        WHERE membership.team_id = task.team_id
          AND app_user.organization_id = task.organization_id
        ORDER BY membership.joined_at NULLS LAST, app_user.id
        LIMIT 1
      ),
      (
        SELECT app_user.id
        FROM users AS app_user
        WHERE app_user.organization_id = task.organization_id
        ORDER BY app_user.created_at NULLS LAST, app_user.id
        LIMIT 1
      )
    ) AS author_id,
    CASE
      WHEN task.has_meaningful_blocks THEN task.learnings_blocks
      ELSE (
        SELECT jsonb_build_object(
          'type', 'doc',
          'content', jsonb_agg(
            CASE
              WHEN legacy_line.line_text = '' THEN
                jsonb_build_object('type', 'paragraph')
              ELSE
                jsonb_build_object(
                  'type', 'paragraph',
                  'content', jsonb_build_array(
                    jsonb_build_object('type', 'text', 'text', legacy_line.line_text)
                  )
                )
            END
            ORDER BY legacy_line.line_number
          )
        )
        FROM regexp_split_to_table(
          replace(
            replace(task.learnings, E'\r\n', E'\n'),
            E'\r',
            E'\n'
          ),
          E'\n'
        ) WITH ORDINALITY AS legacy_line(line_text, line_number)
      )
    END AS content,
    CASE
      WHEN task.has_meaningful_blocks THEN 'learnings_blocks'
      ELSE 'learnings'
    END AS source_kind,
    COALESCE(task.updated_at, task.created_at, now()) AS source_timestamp,
    md5('taskflow:legacy-learnings:v1:' || task.id::text) AS migration_hash
  FROM source_tasks AS task
  WHERE task.has_meaningful_blocks
    OR COALESCE(task.learnings, '') !~ '^[[:space:]]*$'
)
SELECT
  prepared.task_id,
  (
    substr(prepared.migration_hash, 1, 8) || '-' ||
    substr(prepared.migration_hash, 9, 4) || '-' ||
    substr(prepared.migration_hash, 13, 4) || '-' ||
    substr(prepared.migration_hash, 17, 4) || '-' ||
    substr(prepared.migration_hash, 21, 12)
  )::uuid AS note_id,
  prepared.organization_id,
  prepared.team_id,
  prepared.author_id,
  prepared.content,
  prepared.source_kind,
  prepared.source_timestamp
FROM prepared;

DO $$
DECLARE
  unresolved_author_count bigint;
  collision_count bigint;
BEGIN
  SELECT count(*)
    INTO unresolved_author_count
  FROM legacy_learning_note_candidates
  WHERE author_id IS NULL;

  IF unresolved_author_count > 0 THEN
    RAISE EXCEPTION
      'Legacy Learnings migration aborted: % source action(s) have no valid note author',
      unresolved_author_count;
  END IF;

  SELECT count(*)
    INTO collision_count
  FROM legacy_learning_note_candidates AS candidate
  JOIN notes AS existing_note ON existing_note.id = candidate.note_id
  WHERE existing_note.task_id <> candidate.task_id
     OR existing_note.organization_id <> candidate.organization_id
     OR existing_note.team_id <> candidate.team_id
     OR existing_note.type <> 'learning';

  IF collision_count > 0 THEN
    RAISE EXCEPTION
      'Legacy Learnings migration aborted: % deterministic note UUID collision(s) detected',
      collision_count;
  END IF;
END;
$$;

INSERT INTO notes (
  id,
  task_id,
  organization_id,
  team_id,
  author_id,
  title,
  type,
  content,
  created_at,
  updated_at
)
SELECT
  candidate.note_id,
  candidate.task_id,
  candidate.organization_id,
  candidate.team_id,
  candidate.author_id,
  'Learnings',
  'learning',
  candidate.content,
  candidate.source_timestamp,
  candidate.source_timestamp
FROM legacy_learning_note_candidates AS candidate
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  source_action_count bigint;
  block_source_count bigint;
  text_source_count bigint;
  migrated_note_count bigint;
  pending_action_count bigint;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE source_kind = 'learnings_blocks'),
    count(*) FILTER (WHERE source_kind = 'learnings')
    INTO source_action_count, block_source_count, text_source_count
  FROM legacy_learning_note_candidates;

  SELECT count(*)
    INTO migrated_note_count
  FROM legacy_learning_note_candidates AS candidate
  JOIN notes AS migrated_note
    ON migrated_note.id = candidate.note_id
   AND migrated_note.task_id = candidate.task_id
   AND migrated_note.organization_id = candidate.organization_id
   AND migrated_note.team_id = candidate.team_id
   AND migrated_note.type = 'learning';

  pending_action_count := source_action_count - migrated_note_count;

  IF pending_action_count <> 0 THEN
    RAISE EXCEPTION
      'Legacy Learnings migration verification failed: source actions=%, migrated notes=%, pending=%',
      source_action_count,
      migrated_note_count,
      pending_action_count;
  END IF;

  RAISE NOTICE
    'Legacy Learnings migration verified: source actions=% (blocks=%, plain text=%), migrated Learning Notes=%, pending=0',
    source_action_count,
    block_source_count,
    text_source_count,
    migrated_note_count;
END;
$$;

COMMIT;

-- Post-deployment verification (read-only): run this query in Supabase SQL Editor.
-- It reports how many non-empty legacy Learnings sources exist and how many have
-- their deterministic Learning Note. A healthy result has pending_actions = 0.
--
-- WITH RECURSIVE valid_block_nodes (task_id, node) AS (
--   SELECT task.id, task.learnings_blocks
--   FROM tasks AS task
--   WHERE jsonb_typeof(task.learnings_blocks) = 'object'
--     AND task.learnings_blocks->>'type' = 'doc'
--     AND jsonb_typeof(task.learnings_blocks->'content') = 'array'
--   UNION ALL
--   SELECT parent.task_id, child.node
--   FROM valid_block_nodes AS parent
--   CROSS JOIN LATERAL jsonb_array_elements(
--     CASE WHEN jsonb_typeof(parent.node->'content') = 'array'
--       THEN parent.node->'content' ELSE '[]'::jsonb END
--   ) AS child(node)
-- ),
-- source_actions AS (
--   SELECT task.id, task.organization_id, task.team_id
--   FROM tasks AS task
--   WHERE COALESCE(task.learnings, '') !~ '^[[:space:]]*$'
--      OR EXISTS (
--        SELECT 1
--        FROM valid_block_nodes AS block_node
--        WHERE block_node.task_id = task.id
--          AND (
--            (block_node.node->>'type' = 'text'
--              AND COALESCE(block_node.node->>'text', '') !~ '^[[:space:]]*$')
--            OR block_node.node->>'type' = 'horizontalRule'
--          )
--      )
-- ),
-- expected_notes AS (
--   SELECT
--     source_action.id AS task_id,
--     source_action.organization_id,
--     source_action.team_id,
--     (
--       substr(note_hash.value, 1, 8) || '-' ||
--       substr(note_hash.value, 9, 4) || '-' ||
--       substr(note_hash.value, 13, 4) || '-' ||
--       substr(note_hash.value, 17, 4) || '-' ||
--       substr(note_hash.value, 21, 12)
--     )::uuid AS note_id
--   FROM source_actions AS source_action
--   CROSS JOIN LATERAL (
--     SELECT md5('taskflow:legacy-learnings:v1:' || source_action.id::text) AS value
--   ) AS note_hash
-- )
-- SELECT
--   count(*) AS source_actions,
--   count(migrated_note.id) AS migrated_learning_notes,
--   count(*) - count(migrated_note.id) AS pending_actions
-- FROM expected_notes AS expected_note
-- LEFT JOIN notes AS migrated_note
--   ON migrated_note.id = expected_note.note_id
--  AND migrated_note.task_id = expected_note.task_id
--  AND migrated_note.organization_id = expected_note.organization_id
--  AND migrated_note.team_id = expected_note.team_id
--  AND migrated_note.type = 'learning';
