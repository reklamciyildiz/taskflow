-- Phase 2: persist canonical read-tool references and revalidate their live ACL
-- whenever conversation history is loaded. Service-role only.
BEGIN;

CREATE TABLE public.ai_message_references (
  message_id uuid NOT NULL REFERENCES public.ai_messages(id) ON DELETE CASCADE,
  ordinal smallint NOT NULL CHECK (ordinal >= 0 AND ordinal < 50),
  reference_type text NOT NULL CHECK (reference_type IN ('process','action','checklist')),
  reference_id text NOT NULL CHECK (length(reference_id) BETWEEN 1 AND 200),
  project_id uuid,
  action_id uuid,
  checklist_item_id text,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id,ordinal),
  CHECK (
    (reference_type='process' AND project_id IS NOT NULL AND action_id IS NULL AND checklist_item_id IS NULL) OR
    (reference_type='action' AND action_id IS NOT NULL AND checklist_item_id IS NULL) OR
    (reference_type='checklist' AND action_id IS NOT NULL AND checklist_item_id IS NOT NULL)
  )
);
CREATE INDEX ai_message_references_action_idx ON public.ai_message_references(action_id)
  WHERE action_id IS NOT NULL;
CREATE INDEX ai_message_references_project_idx ON public.ai_message_references(project_id)
  WHERE project_id IS NOT NULL;
ALTER TABLE public.ai_message_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_message_references FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE public.ai_message_references TO service_role;

CREATE FUNCTION public.ai_user_can_access_read_reference(
  p_user_id uuid,p_reference_type text,p_project_id uuid,p_action_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE
    WHEN p_reference_type='process' THEN EXISTS(
      SELECT 1 FROM public.projects p
      JOIN public.users u ON u.id=p_user_id AND u.organization_id=p.organization_id
      WHERE p.id=p_project_id
        AND public.ai_user_can_access_chat_scope(u.id,p.team_id,p.id)
    )
    WHEN p_reference_type IN ('action','checklist') THEN EXISTS(
      SELECT 1 FROM public.tasks t
      JOIN public.users u ON u.id=p_user_id AND u.organization_id=t.organization_id
      LEFT JOIN public.projects p ON p.id=t.project_id AND p.organization_id=t.organization_id
      WHERE t.id=p_action_id
        AND (t.project_id IS NULL OR p.id IS NOT NULL)
        AND public.ai_user_can_access_chat_scope(u.id,t.team_id,t.project_id)
    )
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION public.ai_user_can_access_read_reference(uuid,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_user_can_access_read_reference(uuid,text,uuid,uuid)
  TO service_role;

ALTER TABLE public.ai_messages DROP CONSTRAINT ai_messages_grounding_shape;
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_grounding_shape CHECK (
  (grounding_kind='none' AND grounding_team_id IS NULL AND grounding_project_id IS NULL) OR
  (grounding_kind='legacy_unverified' AND grounding_team_id IS NULL AND grounding_project_id IS NULL) OR
  (grounding_kind='knowledge') OR
  (grounding_kind='structured')
);

CREATE FUNCTION public.finalize_ai_chat_message(
  p_message_id uuid,p_user_id uuid,p_organization_id uuid,p_content text,p_status text,
  p_model text,p_input_tokens integer,p_output_tokens integer,p_error_code text,p_sources jsonb,
  p_grounding_kind text,p_grounding_team_id uuid,p_grounding_project_id uuid,p_references jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_source jsonb;v_reference jsonb;v_ordinal integer:=0;
BEGIN
  IF p_status NOT IN ('completed','failed','cancelled') OR length(p_content)>200000
     OR jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)>30
     OR jsonb_typeof(p_references)<>'array' OR jsonb_array_length(p_references)>50
     OR p_grounding_kind NOT IN ('none','knowledge','structured') THEN
    RAISE EXCEPTION 'Invalid assistant message finalization';
  END IF;
  IF p_grounding_kind='none' AND (p_grounding_team_id IS NOT NULL OR p_grounding_project_id IS NOT NULL
     OR jsonb_array_length(p_references)>0) THEN
    RAISE EXCEPTION 'Ungrounded message cannot have an ACL scope';
  END IF;
  IF p_grounding_kind='knowledge' AND p_status='completed' AND jsonb_array_length(p_sources)=0 THEN
    RAISE EXCEPTION 'Knowledge response requires provenance';
  END IF;
  IF p_grounding_kind='structured' AND p_status='completed' AND jsonb_array_length(p_references)=0 THEN
    RAISE EXCEPTION 'Structured response requires canonical references';
  END IF;

  UPDATE public.ai_messages SET content=p_content,status=p_status,model=p_model,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,error_code=p_error_code,
    grounding_kind=p_grounding_kind,grounding_team_id=p_grounding_team_id,
    grounding_project_id=p_grounding_project_id,updated_at=now(),completed_at=now()
  WHERE id=p_message_id AND user_id=p_user_id AND organization_id=p_organization_id
    AND role='assistant';
  IF NOT FOUND THEN RAISE EXCEPTION 'Assistant message scope mismatch'; END IF;

  DELETE FROM public.ai_message_sources WHERE message_id=p_message_id;
  FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    IF coalesce(v_source->>'citationId','') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_source->>'sourceDocumentId','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(v_source#>>'{index,version}','')='' THEN
      RAISE EXCEPTION 'Invalid citation snapshot';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_chunks c JOIN public.ai_source_documents d ON d.id=c.source_document_id
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

  DELETE FROM public.ai_message_references WHERE message_id=p_message_id;
  FOR v_reference IN SELECT value FROM jsonb_array_elements(p_references) LOOP
    IF coalesce(v_reference->>'type','') NOT IN ('process','action','checklist')
       OR coalesce(v_reference->>'id','')=''
       OR coalesce(v_reference->>'title','')='' THEN
      RAISE EXCEPTION 'Invalid canonical reference snapshot';
    END IF;
    IF NOT public.ai_user_can_access_read_reference(
      p_user_id,v_reference->>'type',nullif(v_reference->>'processId','')::uuid,
      nullif(v_reference->>'actionId','')::uuid
    ) THEN RAISE EXCEPTION 'Canonical reference access changed'; END IF;
    INSERT INTO public.ai_message_references(
      message_id,ordinal,reference_type,reference_id,project_id,action_id,checklist_item_id,snapshot
    ) VALUES (
      p_message_id,v_ordinal,v_reference->>'type',v_reference->>'id',
      nullif(v_reference->>'processId','')::uuid,nullif(v_reference->>'actionId','')::uuid,
      nullif(v_reference->>'checklistItemId',''),v_reference
    );
    v_ordinal:=v_ordinal+1;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb,text,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb,text,uuid,uuid,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ai_validate_chat_message_access(
  p_user_id uuid,p_message_ids uuid[]
) RETURNS TABLE(message_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.id FROM public.ai_messages m
  JOIN public.ai_conversations conv ON conv.id=m.conversation_id
  WHERE m.id=ANY(coalesce(p_message_ids,ARRAY[]::uuid[]))
    AND cardinality(p_message_ids)<=300 AND m.role='assistant'
    AND conv.user_id=p_user_id AND conv.deleted_at IS NULL
    AND (
      m.grounding_kind='none' OR
      (m.grounding_kind='structured' AND (
        (EXISTS(SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id)
         AND NOT EXISTS(
           SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id
             AND NOT public.ai_user_can_access_read_reference(
               p_user_id,r.reference_type,r.project_id,r.action_id
             )
         ))
        OR (NOT EXISTS(SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id)
            AND m.grounding_team_id IS NOT NULL
            AND public.ai_user_can_access_chat_scope(p_user_id,m.grounding_team_id,m.grounding_project_id))
      )) OR
      (m.grounding_kind='knowledge'
        AND EXISTS(SELECT 1 FROM public.ai_message_sources s WHERE s.message_id=m.id)
        AND NOT EXISTS(
          SELECT 1 FROM public.ai_message_sources s
          LEFT JOIN public.ai_chunks c ON c.id=s.chunk_id
          LEFT JOIN public.ai_source_documents d ON d.id=c.source_document_id
          WHERE s.message_id=m.id AND (
            c.id IS NULL OR d.id IS NULL OR c.source_document_id<>s.source_document_id
            OR c.index_version<>s.index_version OR c.index_version<>d.active_index_version
            OR c.embedding_model<>d.active_embedding_model
            OR NOT public.ai_user_can_access_source(p_user_id,d.id)
          )
        )
      )
    )
$$;

COMMENT ON TABLE public.ai_message_references IS
  'Canonical read-tool references; snapshots are returned only after live ACL revalidation.';
COMMIT;
