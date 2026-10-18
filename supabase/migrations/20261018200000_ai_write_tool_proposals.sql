-- Phase 3: immutable, user-approved AI write proposals.
-- Prerequisites: 20261017180000_ai_chat_conversations.sql

BEGIN;

CREATE TABLE public.ai_write_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  assistant_message_id uuid NOT NULL REFERENCES public.ai_messages(id) ON DELETE CASCADE,
  tool_name text NOT NULL CHECK (tool_name IN ('create_action','create_note','update_checklist')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  display_snapshot jsonb NOT NULL CHECK (jsonb_typeof(display_snapshot)='object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','executing','completed','rejected','expired','failed')),
  expires_at timestamptz NOT NULL,
  execution_token uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  rejected_at timestamptz,
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result)='object'),
  error_code text,
  error_message text CHECK (error_message IS NULL OR length(error_message)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assistant_message_id),
  CHECK (expires_at > created_at)
);

CREATE INDEX ai_write_proposals_owner_recent_idx
  ON public.ai_write_proposals(user_id, organization_id, created_at DESC);
CREATE INDEX ai_write_proposals_pending_expiry_idx
  ON public.ai_write_proposals(expires_at) WHERE status='pending';

CREATE TABLE public.ai_write_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.ai_write_proposals(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'proposed','approval_claimed','completed','rejected','expired','failed','authorization_denied','stale_rejected'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_write_audit_proposal_idx ON public.ai_write_audit_events(proposal_id,created_at);

ALTER TABLE public.ai_write_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_write_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_write_proposals, public.ai_write_audit_events FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_write_proposals TO service_role;
GRANT SELECT,INSERT ON public.ai_write_audit_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.ai_write_audit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.guard_ai_write_proposal_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.assistant_message_id IS DISTINCT FROM OLD.assistant_message_id
     OR NEW.tool_name IS DISTINCT FROM OLD.tool_name
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.display_snapshot IS DISTINCT FROM OLD.display_snapshot
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI write proposal immutable fields cannot change';
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ai_write_proposal_immutable
  BEFORE UPDATE ON public.ai_write_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_write_proposal_immutable();

CREATE OR REPLACE FUNCTION public.claim_ai_write_proposal(
  p_proposal_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_conversation_id uuid,
  p_payload_hash text
) RETURNS SETOF public.ai_write_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.ai_write_proposals%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ai_write_proposals
    WHERE id=p_proposal_id AND user_id=p_user_id AND organization_id=p_organization_id
      AND conversation_id=p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.status='completed' THEN RETURN NEXT v_row; RETURN; END IF;
  IF v_row.status<>'pending' OR v_row.payload_hash<>p_payload_hash THEN RETURN; END IF;
  IF v_row.expires_at<=now() THEN
    UPDATE public.ai_write_proposals SET status='expired',error_code='EXPIRED',error_message='Proposal expired'
      WHERE id=v_row.id RETURNING * INTO v_row;
    INSERT INTO public.ai_write_audit_events(proposal_id,organization_id,user_id,event_type)
      VALUES(v_row.id,v_row.organization_id,v_row.user_id,'expired');
    RETURN NEXT v_row; RETURN;
  END IF;
  UPDATE public.ai_write_proposals SET status='executing',execution_token=gen_random_uuid(),approved_at=now(),
      error_code=NULL,error_message=NULL WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.ai_write_audit_events(proposal_id,organization_id,user_id,event_type)
    VALUES(v_row.id,v_row.organization_id,v_row.user_id,'approval_claimed');
  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_write_proposal(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_write_proposal(uuid,uuid,uuid,uuid,text) TO service_role;

COMMIT;
