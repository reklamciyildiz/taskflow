-- Make proposal creation/finalization/rejection and their audit events atomic.
-- Prerequisite: 20261018200000_ai_write_tool_proposals.sql
BEGIN;

REVOKE ALL ON FUNCTION public.guard_ai_write_proposal_immutable() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_ai_write_proposal(
  p_organization_id uuid,p_user_id uuid,p_conversation_id uuid,p_assistant_message_id uuid,
  p_tool_name text,p_payload jsonb,p_payload_hash text,p_display_snapshot jsonb,p_expires_at timestamptz
) RETURNS SETOF public.ai_write_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.ai_write_proposals%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_messages m JOIN public.ai_conversations c ON c.id=m.conversation_id
    WHERE m.id=p_assistant_message_id AND m.role='assistant' AND m.user_id=p_user_id
      AND m.organization_id=p_organization_id AND m.conversation_id=p_conversation_id
      AND c.user_id=p_user_id AND c.organization_id=p_organization_id AND c.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Conversation message scope mismatch'; END IF;
  INSERT INTO public.ai_write_proposals(organization_id,user_id,conversation_id,assistant_message_id,
    tool_name,payload,payload_hash,display_snapshot,expires_at)
  VALUES(p_organization_id,p_user_id,p_conversation_id,p_assistant_message_id,p_tool_name,p_payload,
    p_payload_hash,p_display_snapshot,p_expires_at) RETURNING * INTO v_row;
  INSERT INTO public.ai_write_audit_events(proposal_id,organization_id,user_id,event_type,metadata)
    VALUES(v_row.id,v_row.organization_id,v_row.user_id,'proposed',jsonb_build_object('toolName',v_row.tool_name));
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ai_write_proposal(
  p_proposal_id uuid,p_user_id uuid,p_organization_id uuid,p_execution_token uuid,
  p_status text,p_result jsonb DEFAULT NULL,p_error_code text DEFAULT NULL,p_error_message text DEFAULT NULL
) RETURNS SETOF public.ai_write_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.ai_write_proposals%ROWTYPE;v_event text;
BEGIN
  IF p_status NOT IN ('completed','failed') THEN RAISE EXCEPTION 'Invalid proposal finish status'; END IF;
  UPDATE public.ai_write_proposals SET status=p_status,executed_at=now(),result=p_result,
    error_code=p_error_code,error_message=left(p_error_message,500)
    WHERE id=p_proposal_id AND user_id=p_user_id AND organization_id=p_organization_id
      AND status='executing' AND execution_token=p_execution_token RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN; END IF;
  v_event=CASE WHEN p_status='completed' THEN 'completed'
    WHEN p_error_code='AUTHORIZATION_DENIED' THEN 'authorization_denied'
    WHEN p_error_code='STALE_VERSION' THEN 'stale_rejected' ELSE 'failed' END;
  INSERT INTO public.ai_write_audit_events(proposal_id,organization_id,user_id,event_type,metadata)
    VALUES(v_row.id,v_row.organization_id,v_row.user_id,v_event,jsonb_build_object('errorCode',p_error_code));
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_ai_write_proposal(
  p_proposal_id uuid,p_user_id uuid,p_organization_id uuid,p_conversation_id uuid
) RETURNS SETOF public.ai_write_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.ai_write_proposals%ROWTYPE;
BEGIN
  UPDATE public.ai_write_proposals SET status='rejected',rejected_at=now(),error_code=NULL,error_message=NULL
    WHERE id=p_proposal_id AND user_id=p_user_id AND organization_id=p_organization_id
      AND conversation_id=p_conversation_id AND status='pending' RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.ai_write_audit_events(proposal_id,organization_id,user_id,event_type)
    VALUES(v_row.id,v_row.organization_id,v_row.user_id,'rejected');
  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_write_proposal(uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,timestamptz),
  public.finish_ai_write_proposal(uuid,uuid,uuid,uuid,text,jsonb,text,text),
  public.reject_ai_write_proposal(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_write_proposal(uuid,uuid,uuid,uuid,text,jsonb,text,jsonb,timestamptz),
  public.finish_ai_write_proposal(uuid,uuid,uuid,uuid,text,jsonb,text,text),
  public.reject_ai_write_proposal(uuid,uuid,uuid,uuid) TO service_role;

COMMIT;
