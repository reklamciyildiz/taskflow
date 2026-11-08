-- READ ONLY. Run AFTER applying 20261108160000, not before.
-- If Supabase SQL Editor shows only last result grid, execute SELECTs separately.
BEGIN READ ONLY;

-- Three original capacity triggers: all must exist and be enabled.
SELECT t.table_name, t.trigger_name,
  EXISTS(
    SELECT 1 FROM pg_trigger tr
    JOIN pg_class c ON c.oid = tr.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t.table_name
      AND tr.tgname = t.trigger_name AND NOT tr.tgisinternal
      AND tr.tgenabled IN ('O', 'A')
  ) AS enabled
FROM (VALUES
  ('projects', 'trg_actiproc_projects_plan_limit'),
  ('teams', 'trg_actiproc_teams_plan_limit'),
  ('team_members', 'trg_guard_creem_team_member_seat')
) AS t(table_name, trigger_name);

-- SQL function and service-role-only RPC visibility.
SELECT p.proname, p.oid::regprocedure::text AS signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anonymous_executable,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executable,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_executable
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'actiproc_effective_plan_seats',
  'actiproc_enforce_entity_plan_limit',
  'guard_creem_team_member_seat',
  'accept_actiproc_invitation'
)
ORDER BY p.proname;

-- Historical Free content remains untouched and above-limit creates are blocked.
WITH counts AS (
 SELECT o.id, o.plan_name,
    (SELECT COUNT(*) FROM public.projects p WHERE p.organization_id = o.id) AS processes,
    (SELECT COUNT(*) FROM public.teams t WHERE t.organization_id = o.id) AS workspaces
 FROM public.organizations o WHERE o.plan_name = 'free'
)
SELECT COUNT(*) FILTER (WHERE processes > 1) AS legacy_free_process_overlimits,
       COUNT(*) FILTER (WHERE workspaces > 1) AS legacy_free_workspace_overlimits
FROM counts;

-- Pending Creem changes that require verified settlement before granting a plan.
SELECT o.plan_name, pc.previous_plan, pc.desired_plan, pc.status,
       COUNT(*) AS pending_organizations
FROM public.creem_plan_changes pc
JOIN public.organizations o ON o.id = pc.organization_id
WHERE pc.status IN ('pending', 'awaiting_sync', 'review')
GROUP BY o.plan_name, pc.previous_plan, pc.desired_plan, pc.status
ORDER BY o.plan_name, pc.status;

COMMIT;
