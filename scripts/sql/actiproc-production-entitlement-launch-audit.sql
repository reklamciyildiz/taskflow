-- ACTIPROC Production release entitlement audit, 2026-11-08.
-- ONE read-only SELECT; SQL Editor returns ONE JSON result, not just COMMIT.
-- This reports aggregates only (no account emails, IDs, payment secrets).
-- Depends on 20261108120000, 20261108160000 and 20261108210000 migrations.
WITH orgs AS (
 SELECT
   o.id, o.plan_name AS stored_plan, o.subscription_status,
   o.billing_provider, o.creem_test_mode, o.creem_subscription_id,
   ep.effective_plan, ep.seat_limit,
   (SELECT COUNT(*) FROM public.projects p WHERE p.organization_id=o.id) AS processes,
   (SELECT COUNT(*) FROM public.teams t WHERE t.organization_id=o.id) AS workspaces,
   (SELECT COUNT(DISTINCT tm.user_id)
    FROM public.team_members tm
    JOIN public.teams t ON t.id=tm.team_id
    WHERE t.organization_id=o.id) AS used_seats
 FROM public.organizations o
 CROSS JOIN LATERAL public.actiproc_effective_plan_seats(o) ep
),
capacity AS (
 SELECT *,
 CASE effective_plan
   WHEN 'free' THEN 1 WHEN 'individual' THEN 3
   WHEN 'pro' THEN 10 ELSE NULL END AS process_cap,
 CASE effective_plan
   WHEN 'free' THEN 1 WHEN 'individual' THEN 1
   WHEN 'pro' THEN 3 ELSE NULL END AS workspace_cap
 FROM orgs
),
by_plan AS (
 SELECT stored_plan, effective_plan, COUNT(*)::integer AS org_count,
        COALESCE(SUM(used_seats),0)::integer AS used_seats
 FROM capacity GROUP BY stored_plan,effective_plan
),
triggers AS (
 SELECT v.trigger_name,
 EXISTS (
  SELECT 1 FROM pg_trigger tr
  JOIN pg_class c ON c.oid=tr.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=v.table_name
    AND tr.tgname=v.trigger_name AND NOT tr.tgisinternal
    AND tr.tgenabled IN ('O','A')
 ) AS enabled
 FROM (VALUES
  ('projects','trg_actiproc_projects_plan_limit'),
  ('teams','trg_actiproc_teams_plan_limit'),
  ('team_members','trg_guard_creem_team_member_seat')
 ) v(table_name,trigger_name)
),
privileges AS (
 SELECT p.oid::regprocedure::text AS signature,
   has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
   has_function_privilege('authenticated',p.oid,'EXECUTE') AS client_can_execute,
   has_function_privilege('service_role',p.oid,'EXECUTE') AS server_can_execute
 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (
   'actiproc_effective_plan_seats',
   'accept_actiproc_invitation',
   'reserve_creem_seat_change',
   'reserve_creem_resubscription',
   'apply_creem_resubscription'
 )
)
SELECT jsonb_pretty(jsonb_build_object(
 'plans', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stored',stored_plan,'effective',effective_plan,
      'organizations',org_count,'used_seats',used_seats
    ) ORDER BY stored_plan,effective_plan),'[]'::jsonb) FROM by_plan),
 'over_limit', (SELECT jsonb_build_object(
    'process_organizations',COUNT(*) FILTER (WHERE process_cap IS NOT NULL AND processes>process_cap),
    'workspace_organizations',COUNT(*) FILTER (WHERE workspace_cap IS NOT NULL AND workspaces>workspace_cap),
    'seat_organizations',COUNT(*) FILTER (WHERE seat_limit IS NOT NULL AND used_seats>seat_limit)
  ) FROM capacity),
 'sandbox_creem_linked_orgs', (SELECT COUNT(*) FROM orgs
   WHERE billing_provider='creem' AND creem_subscription_id IS NOT NULL
     AND creem_test_mode IS DISTINCT FROM FALSE),
 'guard_triggers', (SELECT jsonb_object_agg(trigger_name,enabled) FROM triggers),
 'server_only_rpcs', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'signature',signature,'anon_execute',anon_can_execute,
    'authenticated_execute',client_can_execute,'service_role_execute',server_can_execute
   ) ORDER BY signature),'[]'::jsonb) FROM privileges),
 'unfulfilled_checkout_intents',
   (SELECT COUNT(*) FROM public.creem_checkout_intents WHERE fulfilled_at IS NULL),
 'pending_plan_changes',
   (SELECT COUNT(*) FROM public.creem_plan_changes WHERE status IN ('pending','awaiting_sync','review')),
 'pending_seat_changes',
   (SELECT COUNT(*) FROM public.creem_seat_changes WHERE status IN ('pending','awaiting_sync','review')),
 'webhook_failed_or_quarantined',
   (SELECT COUNT(*) FROM public.creem_webhook_events WHERE status IN ('failed','quarantined'))
)) AS actiproc_entitlement_health;
