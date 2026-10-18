-- Read-only verification for 20261018110000_ai_retrieval_runtime_repair.sql.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS function_signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('ai_retrieve_chunks','ai_retrieval_index_available')
ORDER BY p.proname;
