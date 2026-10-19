-- Read-only Phase 3.2 production preflight.
SELECT
  to_regclass('public.ai_write_proposals') IS NOT NULL AS proposal_table_exists,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ai_write_proposals'::regclass
      AND conname = 'ai_write_proposals_tool_name_check'
      AND pg_get_constraintdef(oid) LIKE '%update_action%'
      AND pg_get_constraintdef(oid) LIKE '%schedule_action%'
  ) AS action_mutation_tools_allowed,
  relrowsecurity AS rls_enabled,
  has_table_privilege('anon', 'public.ai_write_proposals', 'SELECT') AS anon_select,
  has_table_privilege('authenticated', 'public.ai_write_proposals', 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', 'public.ai_write_proposals', 'SELECT,INSERT,UPDATE') AS service_access
FROM pg_class
WHERE oid = 'public.ai_write_proposals'::regclass;
