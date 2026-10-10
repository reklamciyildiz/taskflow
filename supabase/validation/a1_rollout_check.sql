-- Read-only. Run this AND stage_identity_preflight.sql before the properties migration.
BEGIN TRANSACTION READ ONLY;
WITH expected(table_name, trigger_name, function_name) AS (VALUES
  ('tasks', 'a1_task_stage_integrity', 'a1_guard_task_stage'),
  ('projects', 'a1_project_stage_integrity', 'a1_guard_project_stages')
)
SELECT e.*, t.oid IS NOT NULL AS installed,
  t.tgenabled IN ('O','A') AS enabled_for_normal_writes,
  p.proname = e.function_name AS expected_function,
  pg_get_triggerdef(t.oid) AS trigger_definition,
  pg_get_functiondef(p.oid) AS function_definition,
  pg_get_functiondef(to_regprocedure('public.a1_valid_stage_config(jsonb)')) AS config_validator_definition
FROM expected e
LEFT JOIN pg_class c ON c.relname = e.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname = e.trigger_name AND NOT t.tgisinternal
LEFT JOIN pg_proc p ON p.oid = t.tgfoid;
COMMIT;
