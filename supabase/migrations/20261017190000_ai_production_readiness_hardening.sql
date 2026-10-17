-- Prompt 7 production-readiness corrections.
-- Apply only after 20261017140000, 160000, 170000 and 180000.
BEGIN;

-- Fail before adding composite ownership constraints if legacy rows violate
-- the application invariant. Never rewrite ownership silently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ai_messages m JOIN public.ai_conversations c ON c.id=m.conversation_id
    WHERE (m.user_id,m.organization_id) IS DISTINCT FROM (c.user_id,c.organization_id)
  ) OR EXISTS (
    SELECT 1 FROM public.ai_chat_runs r JOIN public.ai_conversations c ON c.id=r.conversation_id
    WHERE (r.user_id,r.organization_id) IS DISTINCT FROM (c.user_id,c.organization_id)
  ) THEN RAISE EXCEPTION 'AI conversation ownership preflight failed'; END IF;
END $$;

ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_scope_unique UNIQUE(id,organization_id,user_id);
ALTER TABLE public.ai_messages
  ADD CONSTRAINT ai_messages_conversation_scope_fk
  FOREIGN KEY(conversation_id,organization_id,user_id)
  REFERENCES public.ai_conversations(id,organization_id,user_id) ON DELETE CASCADE;
ALTER TABLE public.ai_chat_runs
  ADD CONSTRAINT ai_chat_runs_conversation_scope_fk
  FOREIGN KEY(conversation_id,organization_id,user_id)
  REFERENCES public.ai_conversations(id,organization_id,user_id) ON DELETE CASCADE;

ALTER TABLE public.ai_messages
  ADD COLUMN grounding_kind text NOT NULL DEFAULT 'none'
    CHECK (grounding_kind IN ('none','knowledge','structured','legacy_unverified')),
  -- Deliberately retain deleted scope ids. SET NULL would turn a deleted
  -- Process-specific response into a broader team-scoped response on read.
  ADD COLUMN grounding_team_id uuid,
  ADD COLUMN grounding_project_id uuid,
  ADD CONSTRAINT ai_messages_grounding_shape CHECK (
    (grounding_kind='none' AND grounding_team_id IS NULL AND grounding_project_id IS NULL) OR
    (grounding_kind='legacy_unverified' AND grounding_team_id IS NULL AND grounding_project_id IS NULL) OR
    (grounding_kind='knowledge') OR
    (grounding_kind='structured' AND grounding_team_id IS NOT NULL)
  );

-- Prompt 6 did not persist structured grounding. Preserve rows but fail closed
-- when history is read; source-backed rows can be classified deterministically.
UPDATE public.ai_messages SET grounding_kind='legacy_unverified'
WHERE role='assistant';
UPDATE public.ai_messages m SET grounding_kind='knowledge'
WHERE m.role='assistant' AND EXISTS(
  SELECT 1 FROM public.ai_message_sources s WHERE s.message_id=m.id
);

CREATE OR REPLACE FUNCTION public.ai_user_can_access_chat_scope(
  p_user_id uuid,p_team_id uuid,p_project_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.users u
    LEFT JOIN public.teams t ON t.id=p_team_id AND t.organization_id=u.organization_id
    LEFT JOIN public.projects p ON p.id=p_project_id AND p.organization_id=u.organization_id
    WHERE u.id=p_user_id
      AND (p_team_id IS NULL OR (t.id IS NOT NULL AND (
        u.role IN ('owner','admin') OR EXISTS(
          SELECT 1 FROM public.team_members tm WHERE tm.team_id=t.id AND tm.user_id=u.id
        )
      )))
      AND (p_project_id IS NULL OR (
        p.id IS NOT NULL AND (p.team_id IS NULL OR p.team_id=p_team_id) AND (
          p.visibility='team' OR
          (p.visibility='restricted' AND EXISTS(
            SELECT 1 FROM public.project_members pm WHERE pm.project_id=p.id AND pm.user_id=u.id
          )) OR
          (p.visibility='private' AND (p.created_by=u.id OR EXISTS(
            SELECT 1 FROM public.project_members pm WHERE pm.project_id=p.id AND pm.user_id=u.id
          )))
        )
      ))
  )
$$;

-- Replace Prompt 6 finalization with an ownership/grounding-aware version.
DROP FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb);
CREATE FUNCTION public.finalize_ai_chat_message(
  p_message_id uuid,p_user_id uuid,p_organization_id uuid,p_content text,p_status text,
  p_model text,p_input_tokens integer,p_output_tokens integer,p_error_code text,p_sources jsonb,
  p_grounding_kind text,p_grounding_team_id uuid,p_grounding_project_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_source jsonb;
BEGIN
  IF p_status NOT IN ('completed','failed','cancelled') OR length(p_content)>200000
     OR jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)>30
     OR p_grounding_kind NOT IN ('none','knowledge','structured') THEN
    RAISE EXCEPTION 'Invalid assistant message finalization';
  END IF;
  IF p_grounding_kind='none' AND (p_grounding_team_id IS NOT NULL OR p_grounding_project_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Ungrounded message cannot have an ACL scope';
  END IF;
  IF p_grounding_kind='knowledge' AND p_status='completed' AND jsonb_array_length(p_sources)=0 THEN
    RAISE EXCEPTION 'Knowledge response requires provenance';
  END IF;
  IF p_grounding_kind='structured' AND (
    p_grounding_team_id IS NULL OR NOT public.ai_user_can_access_chat_scope(
      p_user_id,p_grounding_team_id,p_grounding_project_id
    )
  ) THEN RAISE EXCEPTION 'Structured response scope denied'; END IF;

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
  RETURN true;
END;
$$;

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
      (m.grounding_kind='structured' AND public.ai_user_can_access_chat_scope(
        p_user_id,m.grounding_team_id,m.grounding_project_id
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

-- A reused request key may replay only the same conversation turn. Reusing it
-- in another conversation is a conflict, not free quota/concurrency bypass.
CREATE OR REPLACE FUNCTION public.reserve_ai_chat_run(
  p_request_key uuid,p_conversation_id uuid,p_user_id uuid,p_organization_id uuid,
  p_user_limit integer DEFAULT 2,p_org_limit integer DEFAULT 20,p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(allowed boolean,run_id uuid,duplicate boolean,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run public.ai_chat_runs%ROWTYPE;v_user_active integer;v_org_active integer;
BEGIN
  IF p_user_limit NOT BETWEEN 1 AND 10 OR p_org_limit NOT BETWEEN 1 AND 200
     OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN RAISE EXCEPTION 'Invalid chat concurrency settings'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_conversations c WHERE c.id=p_conversation_id
    AND c.user_id=p_user_id AND c.organization_id=p_organization_id AND c.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Conversation scope mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-chat:org:'||p_organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-chat:user:'||p_user_id::text,0));
  SELECT * INTO v_run FROM public.ai_chat_runs WHERE request_key=p_request_key;
  IF FOUND THEN
    IF v_run.user_id<>p_user_id OR v_run.organization_id<>p_organization_id
       OR v_run.conversation_id<>p_conversation_id THEN RAISE EXCEPTION 'Chat request key scope mismatch'; END IF;
    RETURN QUERY SELECT true,v_run.id,true,NULL::text; RETURN;
  END IF;
  UPDATE public.ai_chat_runs SET status='failed',finished_at=now()
    WHERE status='running' AND lease_expires_at<=now();
  SELECT count(*) INTO v_user_active FROM public.ai_chat_runs
    WHERE user_id=p_user_id AND status='running' AND lease_expires_at>now();
  SELECT count(*) INTO v_org_active FROM public.ai_chat_runs
    WHERE organization_id=p_organization_id AND status='running' AND lease_expires_at>now();
  IF v_user_active>=p_user_limit THEN RETURN QUERY SELECT false,NULL::uuid,false,'user_concurrency_limit'::text;RETURN;END IF;
  IF v_org_active>=p_org_limit THEN RETURN QUERY SELECT false,NULL::uuid,false,'organization_concurrency_limit'::text;RETURN;END IF;
  INSERT INTO public.ai_chat_runs(request_key,conversation_id,organization_id,user_id,lease_expires_at)
  VALUES(p_request_key,p_conversation_id,p_organization_id,p_user_id,now()+make_interval(secs=>p_lease_seconds))
  RETURNING * INTO v_run;
  RETURN QUERY SELECT true,v_run.id,false,NULL::text;
END;
$$;

-- Action-derived Note and Attachment text contains the parent Action/Process
-- name. Enqueue every invalidated dependent projection, not only Action chunks.
CREATE OR REPLACE FUNCTION public.ai_task_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data public.tasks%ROWTYPE;child record;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD;ELSE row_data:=NEW;END IF;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now() WHERE task_id=row_data.id;
  PERFORM public.enqueue_ai_index_job('task',row_data.id::text,
    CASE WHEN TG_OP='DELETE' THEN 'delete' ELSE 'upsert' END,
    row_data.organization_id,row_data.team_id,row_data.project_id);
  IF TG_OP<>'DELETE' THEN
    FOR child IN SELECT id,organization_id,team_id FROM public.notes WHERE task_id=row_data.id LOOP
      PERFORM public.enqueue_ai_index_job('note',child.id::text,'upsert',child.organization_id,child.team_id,row_data.project_id);
    END LOOP;
    FOR child IN SELECT id,organization_id,team_id,status FROM public.attachments WHERE task_id=row_data.id LOOP
      PERFORM public.enqueue_ai_index_job('attachment',child.id::text,
        CASE WHEN child.status='ready' THEN 'upsert' ELSE 'delete' END,
        child.organization_id,child.team_id,row_data.project_id);
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_process_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data public.projects%ROWTYPE;child record;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD;ELSE row_data:=NEW;END IF;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now() WHERE project_id=row_data.id;
  PERFORM public.enqueue_ai_index_job('process',row_data.id::text,
    CASE WHEN TG_OP='DELETE' THEN 'delete' ELSE 'upsert' END,row_data.organization_id,row_data.team_id,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE row_data.id END);
  IF TG_OP<>'DELETE' THEN
    FOR child IN SELECT id,organization_id,team_id,project_id FROM public.tasks WHERE project_id=row_data.id LOOP
      PERFORM public.enqueue_ai_index_job('task',child.id::text,'upsert',child.organization_id,child.team_id,child.project_id);
    END LOOP;
    FOR child IN SELECT n.id,n.organization_id,n.team_id FROM public.notes n
      JOIN public.tasks t ON t.id=n.task_id WHERE t.project_id=row_data.id LOOP
      PERFORM public.enqueue_ai_index_job('note',child.id::text,'upsert',child.organization_id,child.team_id,row_data.id);
    END LOOP;
    FOR child IN SELECT a.id,a.organization_id,a.team_id,a.status FROM public.attachments a
      JOIN public.tasks t ON t.id=a.task_id WHERE t.project_id=row_data.id LOOP
      PERFORM public.enqueue_ai_index_job('attachment',child.id::text,
        CASE WHEN child.status='ready' THEN 'upsert' ELSE 'delete' END,
        child.organization_id,child.team_id,row_data.id);
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_index_queue_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object(
    'pending',count(*) FILTER(WHERE status='pending'),
    'processing',count(*) FILTER(WHERE status='processing'),
    'retry',count(*) FILTER(WHERE status='retry'),
    'completed',count(*) FILTER(WHERE status='completed'),
    'deadLetter',count(*) FILTER(WHERE status='dead_letter'),
    'expiredLeases',count(*) FILTER(WHERE status='processing' AND leased_until<now()),
    'oldestReadyAt',min(available_at) FILTER(WHERE status IN ('pending','retry') AND available_at<=now())
  ) FROM public.ai_index_jobs
$$;

REVOKE ALL ON FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_user_can_access_chat_scope(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_validate_chat_message_access(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_index_queue_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_chat_message(uuid,uuid,uuid,text,text,text,integer,integer,text,jsonb,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_can_access_chat_scope(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_validate_chat_message_access(uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_index_queue_health() TO service_role;

COMMIT;
