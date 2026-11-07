-- READ-ONLY Supabase Production entitlement/RLS audit.
-- Run EACH SELECT separately if the SQL editor only shows the last result grid.
BEGIN READ ONLY;

SELECT requested.table_name,
       to_regclass('public.' || requested.table_name) IS NOT NULL AS present,
       COALESCE(c.relrowsecurity,FALSE) AS rls_enabled,
       (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname='public'
        AND p.tablename=requested.table_name) AS policy_count
FROM (VALUES
  ('organizations'),('users'),('teams'),('team_members'),('projects'),
  ('project_members'),('tasks'),('notes'),('webhooks'),('webhook_logs'),
  ('google_calendar_connections'),('google_calendar_event_links'),
  ('creem_checkout_intents'),('creem_webhook_events'),
  ('creem_seat_changes'),('creem_plan_changes')
) AS requested(table_name)
LEFT JOIN pg_class c ON c.oid=to_regclass('public.' || requested.table_name)
ORDER BY requested.table_name;

SELECT requested.trigger_name,
       EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid=t.tgrelid
               JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND t.tgname=requested.trigger_name
                 AND NOT t.tgisinternal AND t.tgenabled IN ('O','A'))
         AS present_enabled
FROM (VALUES ('trg_actiproc_projects_plan_limit'),
             ('trg_actiproc_teams_plan_limit')) AS requested(trigger_name);

SELECT COALESCE(plan_name,'<null>') AS stored_plan,
  COUNT(*) AS organizations,
  COUNT(*) FILTER (WHERE billing_provider='creem'
    AND creem_subscription_id IS NOT NULL AND creem_test_mode IS TRUE) AS test_mode_links,
  COUNT(*) FILTER (WHERE billing_provider='creem'
    AND creem_subscription_id IS NOT NULL AND creem_test_mode IS FALSE) AS live_links,
  COUNT(*) FILTER (WHERE creem_payment_hold IS TRUE) AS payment_holds
FROM public.organizations GROUP BY plan_name ORDER BY plan_name;

WITH counts AS (
 SELECT o.id,o.plan_name,
  (SELECT COUNT(*) FROM public.projects p WHERE p.organization_id=o.id) AS processes,
  (SELECT COUNT(*) FROM public.teams t WHERE t.organization_id=o.id) AS workspaces
 FROM public.organizations o
)
SELECT plan_name,
  COUNT(*) FILTER (
    WHERE plan_name='free' AND processes>1
       OR plan_name='individual' AND processes>3
       OR plan_name='pro' AND processes>10) AS above_process_limit,
  COUNT(*) FILTER (
    WHERE plan_name IN ('free','individual') AND workspaces>1
       OR plan_name='pro' AND workspaces>3) AS above_workspace_limit
FROM counts GROUP BY plan_name ORDER BY plan_name;
COMMIT;
