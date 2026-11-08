-- Actiproc 2026-11-08 seat-pricing Production verification: READ ONLY.
-- Run AFTER applying 20261108210000_actiproc_free_individual_paid_seats.sql.
BEGIN READ ONLY;

-- Both SQL functions must exist and remain executable ONLY by service_role.
SELECT p.proname, p.oid::regprocedure::text AS signature,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_executable,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_executable,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_executable
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('actiproc_effective_plan_seats','reserve_creem_seat_change')
ORDER BY p.proname;

-- Check all active and inactive organization effective capacity without
-- outputting names, emails, Stripe/Creem customer data, or subscription IDs.
SELECT o.plan_name AS stored_plan,
  ep.effective_plan, ep.seat_limit AS effective_seats,
  COUNT(*)::int AS organizations
FROM public.organizations o
CROSS JOIN LATERAL public.actiproc_effective_plan_seats(o) ep
GROUP BY o.plan_name, ep.effective_plan, ep.seat_limit
ORDER BY o.plan_name, ep.effective_plan, ep.seat_limit;

-- Old Free content must remain intact; no destructive migration was intended.
WITH counts AS (
  SELECT o.id, ep.seat_limit AS cap,
    (SELECT COUNT(*) FROM public.teams t WHERE t.organization_id=o.id) AS workspaces,
    (SELECT COUNT(*) FROM public.projects p WHERE p.organization_id=o.id) AS processes,
    (SELECT COUNT(DISTINCT tm.user_id) FROM public.team_members tm
      JOIN public.teams t ON t.id=tm.team_id WHERE t.organization_id=o.id) AS members
  FROM public.organizations o
  CROSS JOIN LATERAL public.actiproc_effective_plan_seats(o) ep
  WHERE o.plan_name='free'
)
SELECT COUNT(*) FILTER (WHERE members>cap)::int AS legacy_free_overseat_orgs,
       COUNT(*) FILTER (WHERE processes>1)::int AS legacy_free_overprocess_orgs,
       COUNT(*) FILTER (WHERE workspaces>1)::int AS legacy_free_overworkspace_orgs
FROM counts;

COMMIT;
