-- Read-only checks after manually applying 20261018200000_ai_write_tool_proposals.sql.
SELECT
  to_regclass('public.ai_write_proposals') IS NOT NULL AS proposal_table_exists,
  to_regclass('public.ai_write_audit_events') IS NOT NULL AS audit_table_exists,
  COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_write_proposals'::regclass),false) AS proposal_rls_enabled,
  COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_write_audit_events'::regclass),false) AS audit_rls_enabled,
  has_table_privilege('anon','public.ai_write_proposals','SELECT') AS anon_select,
  has_table_privilege('authenticated','public.ai_write_proposals','SELECT') AS authenticated_select,
  has_table_privilege('service_role','public.ai_write_proposals','SELECT,INSERT,UPDATE') AS service_proposal_access,
  has_table_privilege('service_role','public.ai_write_audit_events','SELECT,INSERT') AS service_audit_access,
  to_regprocedure('public.claim_ai_write_proposal(uuid,uuid,uuid,uuid,text)') IS NOT NULL AS claim_rpc_exists,
  to_regprocedure('public.create_ai_write_proposal(uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,timestamptz)') IS NOT NULL AS create_rpc_exists,
  to_regprocedure('public.finish_ai_write_proposal(uuid,uuid,uuid,uuid,text,jsonb,text,text)') IS NOT NULL AS finish_rpc_exists,
  to_regprocedure('public.reject_ai_write_proposal(uuid,uuid,uuid,uuid)') IS NOT NULL AS reject_rpc_exists,
  has_function_privilege('anon','public.claim_ai_write_proposal(uuid,uuid,uuid,uuid,text)','EXECUTE') AS anon_execute,
  has_function_privilege('authenticated','public.claim_ai_write_proposal(uuid,uuid,uuid,uuid,text)','EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role','public.claim_ai_write_proposal(uuid,uuid,uuid,uuid,text)','EXECUTE') AS service_execute;

SELECT p.proname,p.prosecdef AS security_definer,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'create_ai_write_proposal','claim_ai_write_proposal','finish_ai_write_proposal','reject_ai_write_proposal'
) ORDER BY p.proname;

SELECT
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid='public.ai_write_proposals'::regclass
      AND c.contype='p'
  ) AS proposal_primary_key_exists,
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid='public.ai_write_proposals'::regclass
      AND c.contype='u'
      AND pg_get_constraintdef(c.oid)='UNIQUE (assistant_message_id)'
  ) AS assistant_message_id_idempotency_unique,
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid='public.ai_write_proposals'::regclass
      AND t.tgname='ai_write_proposal_immutable'
      AND NOT t.tgisinternal
  ) AS immutable_payload_trigger_exists,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='ai_write_proposals'
      AND indexname='ai_write_proposals_pending_expiry_idx'
  ) AS pending_expiry_index_exists,
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid='public.ai_write_audit_events'::regclass
      AND c.contype='f'
      AND c.confrelid='public.ai_write_proposals'::regclass
  ) AS audit_proposal_foreign_key_exists;
