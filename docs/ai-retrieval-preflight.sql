-- READ ONLY. Run after 20261017170000_ai_hybrid_retrieval.sql is applied.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'ai_retrieve_chunks','ai_validate_retrieval_chunks','ai_retrieval_index_available',
  'ai_user_can_access_source'
)
ORDER BY p.proname;

SELECT e.extname,e.extversion,n.nspname AS schema_name
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('vector','pgcrypto')
ORDER BY e.extname;

SELECT
  count(*) FILTER (WHERE stale_at IS NULL) AS active_documents,
  count(*) FILTER (WHERE stale_at IS NOT NULL) AS stale_documents,
  count(*) FILTER (WHERE active_index_version IS NULL) AS unindexed_documents
FROM public.ai_source_documents;

SELECT index_version,embedding_model,count(*) AS chunks
FROM public.ai_chunks
GROUP BY index_version,embedding_model
ORDER BY index_version,embedding_model;
