-- READ ONLY: run after applying 20261017180000_ai_chat_conversations.sql.
SELECT to_regclass('public.ai_conversations') AS conversations,
       to_regclass('public.ai_messages') AS messages,
       to_regclass('public.ai_message_sources') AS message_sources,
       to_regclass('public.ai_chat_runs') AS chat_runs;

SELECT p.proname, p.prosecdef, has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('reserve_ai_chat_run','finish_ai_chat_run','finalize_ai_chat_message','reserve_ai_quota')
ORDER BY p.proname;

SELECT c.relname,c.relrowsecurity,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
       has_table_privilege('service_role',c.oid,'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('ai_conversations','ai_messages','ai_message_sources','ai_chat_runs')
ORDER BY c.relname;

SELECT to_regprocedure('public.ai_validate_retrieval_chunks(uuid,text[],text)') AS citation_validator,
       to_regprocedure('public.ai_retrieve_chunks(uuid,text,extensions.vector,text,integer,integer,integer,real,integer,real,real,text,text[],uuid,uuid)') AS retrieval_rpc;
