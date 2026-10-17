-- READ ONLY. Run in Production Supabase SQL Editor before or after applying
-- the Phase 0 migration. Every statement is safe for projects where migration
-- history is not managed by the Supabase CLI.

-- 1) pgvector availability (zero rows means not installed).
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';

-- 2) Legacy and Phase 0 relation presence.
SELECT name, to_regclass('public.' || name) AS relation
FROM unnest(ARRAY[
  'ai_requests','ai_cache','ai_feedback','ai_costs',
  'ai_quota_counters','ai_quota_reservations'
]) AS name
ORDER BY name;

-- 3) Migration history availability. SQL Editor/manual migrations commonly do
-- not have this relation. Do not query it directly: a static reference would
-- abort this entire diagnostic script when the optional relation is absent.
-- Sections 2, 4, 5, 6 and 7 are the authoritative artifact checks.
SELECT
  to_regclass('supabase_migrations.schema_migrations') AS migration_history_relation,
  CASE
    WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
      THEN 'not available; verify applied artifacts below'
    ELSE 'available; inspect migration history separately if needed'
  END AS interpretation;

-- 4) RLS status.
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ai_requests','ai_cache','ai_feedback','ai_costs',
                    'ai_quota_counters','ai_quota_reservations')
ORDER BY c.relname;

-- 5) Cache policies (expect no browser-readable policy after hardening).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'ai_cache'
ORDER BY policyname;

-- 6) Explicit table grants.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('ai_cache','ai_quota_counters','ai_quota_reservations')
ORDER BY table_name, grantee, privilege_type;

-- 7) Required functions and their EXECUTE grants.
SELECT n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('increment_cache_hit','clean_expired_ai_cache','reserve_ai_quota')
ORDER BY p.proname;

-- 8) Current-period counts used to seed atomic quota counters.
SELECT 'user_day' AS scope, count(*) AS requests
FROM public.ai_requests
WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
UNION ALL
SELECT 'organization_month', count(*)
FROM public.ai_requests
WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
