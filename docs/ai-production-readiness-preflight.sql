-- READ ONLY. Run after 20261017210000_ai_beta_index_claim_scope.sql.
-- Do not interpret migration success alone as a passing security test.

-- 1) Required extensions and relations.
SELECT e.extname,e.extversion,n.nspname AS schema_name
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('vector','pgcrypto') ORDER BY e.extname;

SELECT name,to_regclass('public.'||name) AS relation
FROM unnest(ARRAY[
  'ai_quota_counters','ai_quota_reservations','ai_source_documents','ai_chunks','ai_index_jobs',
  'ai_conversations','ai_messages','ai_message_sources','ai_chat_runs'
]) name ORDER BY name;

-- 2) Every internal AI relation must have RLS and no browser table grants.
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
  has_table_privilege('service_role',c.oid,'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'ai_cache','ai_quota_counters','ai_quota_reservations','ai_source_documents','ai_chunks','ai_index_jobs',
  'ai_conversations','ai_messages','ai_message_sources','ai_chat_runs'
) ORDER BY c.relname;

-- 3) Security-definer RPCs must be service-role-only.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'reserve_ai_quota','claim_ai_index_jobs','claim_ai_index_jobs_for_organizations','fail_ai_index_job','apply_ai_index_result',
  'ai_user_can_access_source','ai_retrieve_chunks','ai_validate_retrieval_chunks',
  'reserve_ai_chat_run','finish_ai_chat_run','finalize_ai_chat_message',
  'ai_user_can_access_chat_scope','ai_validate_chat_message_access','ai_index_queue_health'
) ORDER BY p.proname,arguments;

-- 4) Ownership integrity must return zero rows.
SELECT 'message_scope_mismatch' AS issue,count(*) AS affected
FROM public.ai_messages m JOIN public.ai_conversations c ON c.id=m.conversation_id
WHERE (m.user_id,m.organization_id) IS DISTINCT FROM (c.user_id,c.organization_id)
UNION ALL
SELECT 'run_scope_mismatch',count(*)
FROM public.ai_chat_runs r JOIN public.ai_conversations c ON c.id=r.conversation_id
WHERE (r.user_id,r.organization_id) IS DISTINCT FROM (c.user_id,c.organization_id);

-- 5) Grounding/provenance integrity. knowledge_without_sources and
-- structured_without_team must be zero. legacy_redacted_messages is an impact
-- count, not a migration failure: these historical assistant messages are
-- intentionally denied on read until they can be classified safely.
SELECT
  count(*) FILTER(WHERE role='assistant' AND grounding_kind='knowledge' AND NOT EXISTS(
    SELECT 1 FROM public.ai_message_sources s WHERE s.message_id=ai_messages.id
  )) AS knowledge_without_sources,
  count(*) FILTER(WHERE role='assistant' AND grounding_kind='structured' AND grounding_team_id IS NULL)
    AS structured_without_team,
  count(*) FILTER(WHERE role='assistant' AND grounding_kind='legacy_unverified') AS legacy_redacted_messages
FROM public.ai_messages;

-- 6) Trigger definitions must contain dependent Note/Attachment enqueue logic.
SELECT p.proname,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('ai_task_index_outbox','ai_process_index_outbox')
ORDER BY p.proname;

-- 7) Operational queue state. A 200 cron response is not sufficient by itself.
SELECT public.ai_index_queue_health();
SELECT status,count(*) AS jobs,min(available_at) AS oldest_available,max(attempts) AS max_attempts
FROM public.ai_index_jobs GROUP BY status ORDER BY status;

-- 8) Version drift. Rows for a model/version other than the intended rollout
-- require an explicit reindex decision, not silent mixing.
SELECT index_version,embedding_model,count(*) AS chunks
FROM public.ai_chunks GROUP BY index_version,embedding_model ORDER BY index_version,embedding_model;
