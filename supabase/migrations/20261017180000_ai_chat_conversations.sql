-- Prompt 6: private AI conversations, durable messages and bounded chat runs.
-- Prerequisites:
--   20261017140000_ai_foundation_hardening.sql
--   20261017160000_ai_rag_index_foundation.sql
--   20261017170000_ai_hybrid_retrieval.sql

BEGIN;

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation' CHECK (length(title) BETWEEN 1 AND 120),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX ai_conversations_user_recent_idx
  ON public.ai_conversations(user_id, last_message_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  sequence_number bigint GENERATED ALWAYS AS IDENTITY,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','streaming','completed','failed','cancelled')),
  content text NOT NULL DEFAULT '' CHECK (length(content) <= 200000),
  model text,
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(conversation_id, client_request_id, role),
  UNIQUE(conversation_id, sequence_number)
);

CREATE INDEX ai_messages_conversation_sequence_idx
  ON public.ai_messages(conversation_id, sequence_number);

CREATE TABLE public.ai_message_sources (
  message_id uuid NOT NULL REFERENCES public.ai_messages(id) ON DELETE CASCADE,
  chunk_id text NOT NULL CHECK (chunk_id ~ '^[0-9a-f]{64}$'),
  source_document_id uuid NOT NULL,
  index_version text NOT NULL CHECK (length(index_version) BETWEEN 1 AND 120),
  citation jsonb NOT NULL CHECK (jsonb_typeof(citation) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id, chunk_id)
);

CREATE INDEX ai_message_sources_chunk_idx ON public.ai_message_sources(chunk_id);

CREATE TABLE public.ai_chat_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','cancelled')),
  lease_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX ai_chat_runs_user_active_idx
  ON public.ai_chat_runs(user_id, lease_expires_at)
  WHERE status = 'running';
CREATE INDEX ai_chat_runs_org_active_idx
  ON public.ai_chat_runs(organization_id, lease_expires_at)
  WHERE status = 'running';

-- Service-role access only. NextAuth is canonical; browser JWTs never query
-- conversations directly and service-role callers must scope every query.
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_message_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_conversations, public.ai_messages,
  public.ai_message_sources, public.ai_chat_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations, public.ai_messages,
  public.ai_message_sources, public.ai_chat_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_messages_sequence_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_chat_run(
  p_request_key uuid,
  p_conversation_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_user_limit integer DEFAULT 2,
  p_org_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(allowed boolean, run_id uuid, duplicate boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_run public.ai_chat_runs%ROWTYPE;
  v_user_active integer;
  v_org_active integer;
BEGIN
  IF p_user_limit NOT BETWEEN 1 AND 10 OR p_org_limit NOT BETWEEN 1 AND 200
     OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'Invalid chat concurrency settings';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id=p_conversation_id AND c.user_id=p_user_id
      AND c.organization_id=p_organization_id AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Conversation scope mismatch';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai-chat:org:' || p_organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-chat:user:' || p_user_id::text,0));

  SELECT * INTO v_run FROM public.ai_chat_runs
    WHERE request_key=p_request_key AND user_id=p_user_id
      AND organization_id=p_organization_id;
  IF FOUND THEN
    RETURN QUERY SELECT true,v_run.id,true,NULL::text;
    RETURN;
  END IF;

  UPDATE public.ai_chat_runs SET status='failed',finished_at=now()
    WHERE status='running' AND lease_expires_at <= now();
  SELECT count(*) INTO v_user_active FROM public.ai_chat_runs
    WHERE user_id=p_user_id AND status='running' AND lease_expires_at>now();
  SELECT count(*) INTO v_org_active FROM public.ai_chat_runs
    WHERE organization_id=p_organization_id AND status='running' AND lease_expires_at>now();
  IF v_user_active >= p_user_limit THEN
    RETURN QUERY SELECT false,NULL::uuid,false,'user_concurrency_limit'::text;
    RETURN;
  END IF;
  IF v_org_active >= p_org_limit THEN
    RETURN QUERY SELECT false,NULL::uuid,false,'organization_concurrency_limit'::text;
    RETURN;
  END IF;

  INSERT INTO public.ai_chat_runs(
    request_key,conversation_id,organization_id,user_id,lease_expires_at
  ) VALUES (
    p_request_key,p_conversation_id,p_organization_id,p_user_id,
    now()+make_interval(secs=>p_lease_seconds)
  ) RETURNING * INTO v_run;
  RETURN QUERY SELECT true,v_run.id,false,NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ai_chat_run(
  p_run_id uuid,
  p_user_id uuid,
  p_status text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status NOT IN ('completed','failed','cancelled') THEN
    RAISE EXCEPTION 'Invalid chat run status';
  END IF;
  UPDATE public.ai_chat_runs SET status=p_status,finished_at=now(),lease_expires_at=now()
    WHERE id=p_run_id AND user_id=p_user_id AND status='running';
  RETURN FOUND;
END;
$$;

-- Persist the final assistant message and its verified citation registry in one
-- transaction. A citation write failure must never leave source-backed content
-- without the ACL-revalidation relationship used when history is read.
CREATE OR REPLACE FUNCTION public.finalize_ai_chat_message(
  p_message_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_content text,
  p_status text,
  p_model text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_sources jsonb DEFAULT '[]'::jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_source jsonb;
BEGIN
  IF p_status NOT IN ('completed','failed','cancelled') OR length(p_content)>200000
     OR jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)>30 THEN
    RAISE EXCEPTION 'Invalid assistant message finalization';
  END IF;
  UPDATE public.ai_messages SET content=p_content,status=p_status,model=p_model,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,error_code=p_error_code,
    updated_at=now(),completed_at=now()
  WHERE id=p_message_id AND user_id=p_user_id AND organization_id=p_organization_id
    AND role='assistant';
  IF NOT FOUND THEN RAISE EXCEPTION 'Assistant message scope mismatch'; END IF;

  DELETE FROM public.ai_message_sources WHERE message_id=p_message_id;
  FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources)
  LOOP
    IF coalesce(v_source->>'citationId','') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_source->>'sourceDocumentId','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(v_source#>>'{index,version}','')='' THEN
      RAISE EXCEPTION 'Invalid citation snapshot';
    END IF;
    -- Re-check current ACL inside the same transaction as persistence.
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_chunks c
      JOIN public.ai_source_documents d ON d.id=c.source_document_id
      WHERE c.id=v_source->>'citationId'
        AND c.source_document_id=(v_source->>'sourceDocumentId')::uuid
        AND c.index_version=v_source#>>'{index,version}'
        AND c.index_version=d.active_index_version
        AND c.embedding_model=d.active_embedding_model
        AND public.ai_user_can_access_source(p_user_id,d.id)
    ) THEN RAISE EXCEPTION 'Citation access changed'; END IF;
    INSERT INTO public.ai_message_sources(message_id,chunk_id,source_document_id,index_version,citation)
    VALUES (p_message_id,v_source->>'citationId',(v_source->>'sourceDocumentId')::uuid,
      v_source#>>'{index,version}',v_source);
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_chat_run(uuid,uuid,uuid,uuid,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_chat_run(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_chat_run(uuid,uuid,uuid,uuid,integer,integer,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_chat_run(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb)
  TO service_role;

COMMENT ON TABLE public.ai_message_sources IS
  'Citation snapshots are returned only after current ACL revalidation; they are not an authorization source.';

COMMIT;
