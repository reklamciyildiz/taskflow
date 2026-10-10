-- Run in Supabase SQL editor. Read-only; intentionally does not guess repaired mappings.
BEGIN TRANSACTION READ ONLY;
WITH configs AS (
  SELECT p.*, CASE WHEN jsonb_typeof(column_config) = 'array' THEN column_config ELSE '[]'::jsonb END AS entries
  FROM public.projects p
), entries AS (
  SELECT p.id AS project_id, e.value AS entry FROM configs p CROSS JOIN LATERAL jsonb_array_elements(p.entries) e
), findings AS (
  SELECT 'empty_or_malformed_config' AS issue, id AS project_id, NULL::uuid AS task_id, name AS detail
  FROM configs WHERE jsonb_typeof(column_config) IS DISTINCT FROM 'array' OR jsonb_array_length(entries) = 0
  UNION ALL
  SELECT 'invalid_column', project_id, NULL::uuid, entry::text FROM entries
  WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
    OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string' OR btrim(entry->>'id') = ''
    OR jsonb_typeof(entry->'title') IS DISTINCT FROM 'string' OR btrim(entry->>'title') = ''
    OR (entry ? 'isTerminal' AND jsonb_typeof(entry->'isTerminal') <> 'boolean')
    OR (entry ? 'color' AND jsonb_typeof(entry->'color') <> 'string')
  UNION ALL
  SELECT 'duplicate_column_id', project_id, NULL::uuid, entry->>'id' FROM entries
  GROUP BY project_id, entry->>'id' HAVING count(*) > 1
  UNION ALL
  SELECT 'multiple_terminal_columns', project_id, NULL::uuid, count(*)::text FROM entries
  WHERE entry->'isTerminal' = 'true'::jsonb GROUP BY project_id HAVING count(*) > 1
  UNION ALL
  SELECT 'legacy_done_without_terminal_flag', project_id, NULL::uuid, entry::text FROM entries
  WHERE entry->>'id' = 'done' AND entry->'isTerminal' IS DISTINCT FROM 'true'::jsonb
  UNION ALL
  SELECT 'no_terminal_columns', p.id, NULL::uuid, p.name FROM configs p
  WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.project_id = p.id AND e.entry->'isTerminal' = 'true'::jsonb)
  UNION ALL
  SELECT 'orphan_status', t.project_id, t.id, t.status FROM public.tasks t WHERE t.project_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.project_id = t.project_id AND e.entry->>'id' = t.status)
  UNION ALL
  SELECT 'general_unscoped_action', NULL::uuid, id, status FROM public.tasks WHERE project_id IS NULL
  UNION ALL
  SELECT 'process_scope_mismatch', t.project_id, t.id, t.status FROM public.tasks t
  JOIN public.projects p ON p.id = t.project_id WHERE p.organization_id IS DISTINCT FROM t.organization_id
    OR (p.team_id IS NOT NULL AND p.team_id IS DISTINCT FROM t.team_id)
)
SELECT issue, project_id, task_id, detail, count(*) OVER (PARTITION BY issue) AS issue_count
FROM findings ORDER BY issue, project_id, task_id;
-- Multiple/no terminal columns and General Actions are findings, not automatic corruption.
-- Orphan cause cannot be reconstructed from current data: compare historical backups manually.
COMMIT;
