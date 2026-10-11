-- READ ONLY. Run in the Supabase SQL editor. No labels imply completion.
-- Select the intended project_id if several workspaces use this process name.
WITH stages AS (
  SELECT p.id AS project_id, p.name, p.organization_id, p.team_id,
    entry.value AS stage, entry.ordinality AS position
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.column_config) = 'array' THEN p.column_config ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS entry(value, ordinality)
  WHERE p.name = 'SmartSafe AI'
)
SELECT project_id, name, organization_id, team_id, position,
  stage->>'id' AS stage_id, stage->>'title' AS label,
  stage->'isTerminal' AS configured_terminal,
  (stage->'isTerminal' = 'true'::jsonb) IS TRUE AS runtime_terminal,
  (SELECT count(*) FROM public.tasks t WHERE t.project_id = stages.project_id
     AND t.status = stages.stage->>'id') AS action_count
FROM stages ORDER BY project_id, position;

SELECT t.id AS action_id, t.title, t.project_id, t.status,
  matches.stage_count, matches.labels,
  matches.stage_count = 1 AND matches.terminal AS expected_checked_and_struck
FROM public.tasks t
JOIN public.projects p ON p.id = t.project_id
CROSS JOIN LATERAL (
  SELECT count(*) AS stage_count, jsonb_agg(stage->>'title') AS labels,
    bool_or((stage->'isTerminal' = 'true'::jsonb) IS TRUE) AS terminal
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.column_config) = 'array'
    THEN p.column_config ELSE '[]'::jsonb END) AS stage
  WHERE stage->>'id' = t.status
) matches
WHERE p.name = 'SmartSafe AI'
ORDER BY t.project_id, t.status, t.title;
