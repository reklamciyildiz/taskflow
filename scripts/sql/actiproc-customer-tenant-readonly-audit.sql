-- Read-only tenant/customer preflight. Execute each SELECT independently
-- in the Supabase Production SQL Editor and record results before any schema change.
-- No RLS policy, trigger, customer, task, subscription or user row is modified.
BEGIN READ ONLY;

SELECT t.organization_id AS task_organization_id,
       c.organization_id AS customer_organization_id,
       COUNT(*) AS mismatched_references
FROM public.tasks t
JOIN public.customers c ON c.id = t.customer_id
WHERE t.organization_id IS DISTINCT FROM c.organization_id
GROUP BY t.organization_id, c.organization_id
ORDER BY mismatched_references DESC;

SELECT COUNT(*) AS total_customers,
       COUNT(DISTINCT organization_id) AS customer_organizations
FROM public.customers;

SELECT relname AS table_name, relrowsecurity AS rls_enabled,
       relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid IN ('public.customers'::regclass, 'public.tasks'::regclass);

SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('customers','tasks')
ORDER BY tablename, policyname;

SELECT conrelid::regclass::text AS table_name, conname AS constraint_name,
       pg_get_constraintdef(oid) AS definition,
       convalidated AS validated
FROM pg_constraint
WHERE conrelid IN ('public.customers'::regclass,'public.tasks'::regclass)
  AND contype IN ('f','u','p')
ORDER BY table_name, constraint_name;

COMMIT;
