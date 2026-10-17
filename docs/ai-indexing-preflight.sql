-- READ ONLY. Safe before or after the Prompt 4 migration.
-- 1) Required canonical relations and the extension schema must exist first.
SELECT name,to_regclass('public.'||name) AS relation
FROM unnest(ARRAY[
  'organizations','users','teams','team_members','projects','project_members',
  'tasks','notes','attachments','attachment_links'
]) name
ORDER BY name;

SELECT to_regnamespace('extensions') AS extensions_schema;

-- Before migration this can legitimately return no rows. After migration it
-- must return vector and pgcrypto in the extensions schema.
SELECT e.extname,e.extversion,n.nspname AS schema_name
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('vector','pgcrypto')
ORDER BY e.extname;

-- 2) Prompt 4 relations (NULL before migration is expected).
SELECT name,to_regclass('public.'||name) AS relation
FROM unnest(ARRAY['ai_source_documents','ai_chunks','ai_index_jobs']) name
ORDER BY name;

-- 3) After migration, all three relations must have RLS enabled.
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('ai_source_documents','ai_chunks','ai_index_jobs')
ORDER BY c.relname;

SELECT table_name,grantee,privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('ai_source_documents','ai_chunks','ai_index_jobs')
ORDER BY table_name,grantee,privilege_type;

SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'enqueue_ai_index_job','claim_ai_index_jobs','fail_ai_index_job',
  'apply_ai_index_result','ai_user_can_access_source'
) ORDER BY p.proname;

-- 4) Trigger installation. All five rows must be enabled after migration.
SELECT event_object_table,trigger_name,action_timing,event_manipulation
FROM information_schema.triggers
WHERE trigger_schema='public' AND trigger_name IN (
  'ai_task_index_outbox_trigger','ai_note_index_outbox_trigger',
  'ai_process_index_outbox_trigger','ai_attachment_index_outbox_trigger',
  'ai_attachment_link_index_outbox_trigger'
)
ORDER BY event_object_table,trigger_name,event_manipulation;

-- After the relation check confirms ai_index_jobs exists, queue depth can be
-- inspected separately with:
-- SELECT status,count(*) FROM public.ai_index_jobs GROUP BY status ORDER BY status;
