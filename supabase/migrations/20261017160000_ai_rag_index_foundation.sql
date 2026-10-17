-- Prompt 4: reproducible, server-only RAG indexing projection.
-- Manual rollout only. Does not backfill or call an external provider.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
DECLARE misplaced_extension text;
BEGIN
  SELECT e.extname||'@'||n.nspname INTO misplaced_extension
  FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname IN ('vector','pgcrypto') AND n.nspname<>'extensions'
  LIMIT 1;
  IF misplaced_extension IS NOT NULL THEN
    RAISE EXCEPTION 'Required extension must be installed in extensions schema: %',misplaced_extension;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.ai_source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('action','checklist','note','process','attachment')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 160),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  note_id uuid REFERENCES public.notes(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  source_revision bigint NOT NULL DEFAULT 1 CHECK (source_revision > 0),
  active_index_version text,
  active_embedding_model text,
  source_updated_at timestamptz NOT NULL,
  indexed_at timestamptz,
  stale_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_key),
  CHECK (
    (source_type = 'action' AND task_id IS NOT NULL AND source_key = task_id::text) OR
    (source_type = 'checklist' AND task_id IS NOT NULL) OR
    (source_type = 'note' AND note_id IS NOT NULL AND source_key = note_id::text) OR
    (source_type = 'process' AND project_id IS NOT NULL AND source_key = project_id::text) OR
    (source_type = 'attachment' AND attachment_id IS NOT NULL AND source_key = attachment_id::text)
  )
);

CREATE INDEX ai_source_documents_scope_idx
  ON public.ai_source_documents(organization_id, team_id, project_id)
  WHERE stale_at IS NULL;
CREATE INDEX ai_source_documents_task_idx
  ON public.ai_source_documents(task_id, source_type)
  WHERE task_id IS NOT NULL;
CREATE INDEX ai_source_documents_active_idx
  ON public.ai_source_documents(active_index_version, active_embedding_model)
  WHERE stale_at IS NULL;

CREATE TABLE public.ai_chunks (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  source_document_id uuid NOT NULL REFERENCES public.ai_source_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  index_version text NOT NULL CHECK (length(index_version) BETWEEN 1 AND 120),
  embedding_model text NOT NULL CHECK (length(embedding_model) BETWEEN 1 AND 200),
  chunk_ordinal integer NOT NULL CHECK (chunk_ordinal >= 0),
  content text NOT NULL CHECK (length(content) > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  token_estimate integer NOT NULL CHECK (token_estimate > 0),
  embedding extensions.vector(1024) NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, content)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_document_id, index_version, embedding_model, chunk_ordinal)
);

CREATE INDEX ai_chunks_scope_idx ON public.ai_chunks(organization_id, team_id, project_id);
CREATE INDEX ai_chunks_source_idx ON public.ai_chunks(source_document_id, chunk_ordinal);
CREATE INDEX ai_chunks_fts_idx ON public.ai_chunks USING gin(search_vector);
-- Deliberately no HNSW index in the initial rollout. Exact cosine search with
-- tenant/team/project B-tree pruning has perfect recall and is measurable first.

CREATE TABLE public.ai_index_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type IN ('task','note','process','attachment')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 160),
  operation text NOT NULL DEFAULT 'upsert' CHECK (operation IN ('upsert','delete')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','retry','completed','dead_letter')),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  lease_token uuid,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(source_type, source_key),
  CHECK ((status = 'processing') = (lease_token IS NOT NULL AND leased_until IS NOT NULL))
);

CREATE INDEX ai_index_jobs_claim_idx
  ON public.ai_index_jobs(status, available_at, id)
  WHERE status IN ('pending','retry','processing');
CREATE INDEX ai_index_jobs_dead_letter_idx
  ON public.ai_index_jobs(updated_at DESC)
  WHERE status = 'dead_letter';

ALTER TABLE public.ai_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_index_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_source_documents, public.ai_chunks, public.ai_index_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_source_documents, public.ai_chunks, public.ai_index_jobs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_index_jobs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_ai_index_job(
  p_source_type text,
  p_source_key text,
  p_operation text,
  p_organization_id uuid,
  p_team_id uuid,
  p_project_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_source_type NOT IN ('task','note','process','attachment')
     OR p_operation NOT IN ('upsert','delete') OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Invalid AI index job';
  END IF;
  INSERT INTO public.ai_index_jobs(
    source_type,source_key,operation,organization_id,team_id,project_id
  ) VALUES (
    p_source_type,p_source_key,p_operation,p_organization_id,p_team_id,p_project_id
  )
  ON CONFLICT(source_type,source_key) DO UPDATE SET
    operation = EXCLUDED.operation,
    organization_id = EXCLUDED.organization_id,
    team_id = EXCLUDED.team_id,
    project_id = EXCLUDED.project_id,
    generation = ai_index_jobs.generation + 1,
    status = CASE
      WHEN ai_index_jobs.status='processing' AND ai_index_jobs.leased_until > now()
        THEN 'processing' ELSE 'pending' END,
    attempts = CASE
      WHEN ai_index_jobs.status='processing' AND ai_index_jobs.leased_until > now()
        THEN ai_index_jobs.attempts ELSE 0 END,
    available_at = CASE
      WHEN ai_index_jobs.status='processing' AND ai_index_jobs.leased_until > now()
        THEN ai_index_jobs.available_at ELSE now() END,
    leased_until = CASE
      WHEN ai_index_jobs.status='processing' AND ai_index_jobs.leased_until > now()
        THEN ai_index_jobs.leased_until ELSE NULL END,
    lease_token = CASE
      WHEN ai_index_jobs.status='processing' AND ai_index_jobs.leased_until > now()
        THEN ai_index_jobs.lease_token ELSE NULL END,
    last_error_code = NULL,
    last_error_message = NULL,
    completed_at = NULL,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.ai_task_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data public.tasks%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD; ELSE row_data:=NEW; END IF;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now()
    WHERE task_id=row_data.id;
  PERFORM public.enqueue_ai_index_job(
    'task',row_data.id::text,CASE WHEN TG_OP='DELETE' THEN 'delete' ELSE 'upsert' END,
    row_data.organization_id,row_data.team_id,row_data.project_id
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_task_index_outbox_trigger
AFTER INSERT OR DELETE OR UPDATE OF title,description,checklist_blocks,project_id,organization_id,team_id
ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.ai_task_index_outbox();

CREATE OR REPLACE FUNCTION public.ai_note_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data public.notes%ROWTYPE; parent_project uuid;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD; ELSE row_data:=NEW; END IF;
  SELECT project_id INTO parent_project FROM public.tasks WHERE id=row_data.task_id;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now()
    WHERE source_type='note' AND source_key=row_data.id::text;
  PERFORM public.enqueue_ai_index_job(
    'note',row_data.id::text,CASE WHEN TG_OP='DELETE' THEN 'delete' ELSE 'upsert' END,
    row_data.organization_id,row_data.team_id,parent_project
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_note_index_outbox_trigger
AFTER INSERT OR DELETE OR UPDATE OF title,type,content,task_id,organization_id,team_id
ON public.notes FOR EACH ROW EXECUTE FUNCTION public.ai_note_index_outbox();

CREATE OR REPLACE FUNCTION public.ai_process_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data public.projects%ROWTYPE; task_row record;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD; ELSE row_data:=NEW; END IF;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now()
    WHERE project_id=row_data.id;
  PERFORM public.enqueue_ai_index_job(
    'process',row_data.id::text,CASE WHEN TG_OP='DELETE' THEN 'delete' ELSE 'upsert' END,
    row_data.organization_id,row_data.team_id,CASE WHEN TG_OP='DELETE' THEN NULL ELSE row_data.id END
  );
  IF TG_OP <> 'DELETE' THEN
    FOR task_row IN SELECT id,organization_id,team_id,project_id FROM public.tasks WHERE project_id=row_data.id LOOP
      PERFORM public.enqueue_ai_index_job('task',task_row.id::text,'upsert',
        task_row.organization_id,task_row.team_id,task_row.project_id);
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_process_index_outbox_trigger
AFTER INSERT OR DELETE OR UPDATE OF name,organization_id,team_id
ON public.projects FOR EACH ROW EXECUTE FUNCTION public.ai_process_index_outbox();

CREATE OR REPLACE FUNCTION public.ai_attachment_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data public.attachments%ROWTYPE; parent_project uuid;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD; ELSE row_data:=NEW; END IF;
  SELECT project_id INTO parent_project FROM public.tasks WHERE id=row_data.task_id;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now()
    WHERE source_type='attachment' AND source_key=row_data.id::text;
  PERFORM public.enqueue_ai_index_job(
    'attachment',row_data.id::text,
    CASE WHEN TG_OP='DELETE' OR row_data.status <> 'ready' THEN 'delete' ELSE 'upsert' END,
    row_data.organization_id,row_data.team_id,parent_project
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_attachment_index_outbox_trigger
AFTER INSERT OR DELETE OR UPDATE OF filename,mime_type,status,task_id,organization_id,team_id
ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.ai_attachment_index_outbox();

CREATE OR REPLACE FUNCTION public.ai_attachment_link_index_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data public.attachment_links%ROWTYPE; file_row public.attachments%ROWTYPE; parent_project uuid;
BEGIN
  IF TG_OP='DELETE' THEN row_data:=OLD; ELSE row_data:=NEW; END IF;
  SELECT * INTO file_row FROM public.attachments WHERE id=row_data.attachment_id;
  IF FOUND THEN
    SELECT project_id INTO parent_project FROM public.tasks WHERE id=file_row.task_id;
    UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now()
      WHERE source_type='attachment' AND source_key=file_row.id::text;
    PERFORM public.enqueue_ai_index_job('attachment',file_row.id::text,
      CASE WHEN file_row.status='ready' THEN 'upsert' ELSE 'delete' END,
      file_row.organization_id,file_row.team_id,parent_project);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_attachment_link_index_outbox_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.attachment_links
FOR EACH ROW EXECUTE FUNCTION public.ai_attachment_link_index_outbox();

CREATE OR REPLACE FUNCTION public.claim_ai_index_jobs(
  p_limit integer DEFAULT 8,
  p_lease_seconds integer DEFAULT 120,
  p_max_attempts integer DEFAULT 8
) RETURNS SETOF public.ai_index_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 15 AND 300
     OR p_max_attempts NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid claim settings'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id FROM public.ai_index_jobs j
    WHERE j.attempts < p_max_attempts AND (
      (j.status IN ('pending','retry') AND j.available_at <= now()) OR
      (j.status='processing' AND j.leased_until < now())
    )
    ORDER BY j.available_at,j.id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_index_jobs j SET
    status='processing',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),leased_until=now()+make_interval(secs=>p_lease_seconds),
    updated_at=now()
  FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION public.fail_ai_index_job(
  p_job_id bigint,p_lease_token uuid,p_error_code text,p_error_message text,
  p_max_attempts integer DEFAULT 8
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.ai_index_jobs SET
    status=CASE WHEN attempts>=p_max_attempts THEN 'dead_letter' ELSE 'retry' END,
    available_at=CASE WHEN attempts>=p_max_attempts THEN available_at
      ELSE now()+least(interval '30 minutes',interval '15 seconds' * power(2,greatest(0,attempts-1))) END,
    lease_token=NULL,leased_until=NULL,
    last_error_code=left(coalesce(p_error_code,'unknown'),80),
    last_error_message=left(coalesce(p_error_message,'Indexing failed'),240),updated_at=now()
  WHERE id=p_job_id AND status='processing' AND lease_token=p_lease_token;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.apply_ai_index_result(
  p_job_id bigint,p_lease_token uuid,p_generation bigint,p_documents jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  job public.ai_index_jobs%ROWTYPE; doc jsonb; chunk jsonb; document_id uuid;
  keep_keys text[] := '{}'; expected_id text; current_generation bigint;
  canonical_org uuid; canonical_team uuid; canonical_project uuid; canonical_task uuid;
  canonical_note uuid; canonical_attachment uuid; reuse_existing boolean;
BEGIN
  IF jsonb_typeof(p_documents) <> 'array' OR jsonb_array_length(p_documents)>1000 THEN
    RAISE EXCEPTION 'Invalid index document batch';
  END IF;
  SELECT * INTO job FROM public.ai_index_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR job.status<>'processing' OR job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'AI index lease lost';
  END IF;

  IF job.source_type='task' THEN
    SELECT id,organization_id,team_id,project_id INTO canonical_task,canonical_org,canonical_team,canonical_project
      FROM public.tasks WHERE id=job.source_key::uuid;
  ELSIF job.source_type='note' THEN
    SELECT n.id,t.id,n.organization_id,n.team_id,t.project_id
      INTO canonical_note,canonical_task,canonical_org,canonical_team,canonical_project
      FROM public.notes n JOIN public.tasks t ON t.id=n.task_id WHERE n.id=job.source_key::uuid;
  ELSIF job.source_type='process' THEN
    SELECT id,organization_id,team_id,id INTO canonical_project,canonical_org,canonical_team,canonical_project
      FROM public.projects WHERE id=job.source_key::uuid;
  ELSIF job.source_type='attachment' THEN
    SELECT a.id,t.id,a.organization_id,a.team_id,t.project_id
      INTO canonical_attachment,canonical_task,canonical_org,canonical_team,canonical_project
      FROM public.attachments a JOIN public.tasks t ON t.id=a.task_id
      WHERE a.id=job.source_key::uuid AND a.status='ready';
  END IF;

  IF canonical_org IS NULL AND jsonb_array_length(p_documents)>0 THEN
    RAISE EXCEPTION 'Canonical AI source no longer exists';
  END IF;

  FOR doc IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    IF doc->>'organizationId' IS DISTINCT FROM canonical_org::text
       OR (doc->>'teamId') IS DISTINCT FROM canonical_team::text
       OR (doc->>'projectId') IS DISTINCT FROM canonical_project::text THEN
      RAISE EXCEPTION 'AI document scope mismatch';
    END IF;
    IF job.source_type='task' AND (doc->>'sourceType' NOT IN ('action','checklist') OR doc->>'taskId'<>canonical_task::text) THEN
      RAISE EXCEPTION 'Invalid task-derived AI document';
    ELSIF job.source_type='note' AND (doc->>'sourceType'<>'note' OR doc->>'sourceKey'<>canonical_note::text) THEN
      RAISE EXCEPTION 'Invalid note-derived AI document';
    ELSIF job.source_type='process' AND (doc->>'sourceType'<>'process' OR doc->>'sourceKey'<>canonical_project::text) THEN
      RAISE EXCEPTION 'Invalid process-derived AI document';
    ELSIF job.source_type='attachment' AND (doc->>'sourceType'<>'attachment' OR doc->>'sourceKey'<>canonical_attachment::text) THEN
      RAISE EXCEPTION 'Invalid attachment-derived AI document';
    END IF;
    IF doc->>'contentHash' !~ '^[0-9a-f]{64}$' OR length(coalesce(doc->>'content',''))=0 THEN
      RAISE EXCEPTION 'Invalid AI document content';
    END IF;
    keep_keys:=array_append(keep_keys,doc->>'sourceKey');
    reuse_existing:=coalesce((doc->>'reuseExisting')::boolean,false);

    IF reuse_existing THEN
      SELECT d.id INTO document_id FROM public.ai_source_documents d
      WHERE d.source_type=doc->>'sourceType' AND d.source_key=doc->>'sourceKey'
        AND d.active_index_version=doc->>'indexVersion' AND d.active_embedding_model=doc->>'embeddingModel'
        AND d.content_hash=doc->>'contentHash'
        AND EXISTS(SELECT 1 FROM public.ai_chunks c WHERE c.source_document_id=d.id)
      FOR UPDATE;
      IF document_id IS NULL THEN
        RAISE EXCEPTION 'Cannot reuse missing or incompatible AI index';
      END IF;
      UPDATE public.ai_source_documents SET
        organization_id=canonical_org,team_id=canonical_team,project_id=canonical_project,
        task_id=nullif(doc->>'taskId','')::uuid,note_id=nullif(doc->>'noteId','')::uuid,
        attachment_id=nullif(doc->>'attachmentId','')::uuid,title=coalesce(doc->>'title',''),
        content=doc->>'content',source_updated_at=(doc->>'sourceUpdatedAt')::timestamptz,
        stale_at=NULL,updated_at=now(),
        source_revision=CASE WHEN organization_id IS DISTINCT FROM canonical_org
          OR team_id IS DISTINCT FROM canonical_team OR project_id IS DISTINCT FROM canonical_project
          THEN source_revision+1 ELSE source_revision END
      WHERE id=document_id;
    ELSE
      IF jsonb_typeof(doc->'chunks')<>'array' OR jsonb_array_length(doc->'chunks')=0 THEN
        RAISE EXCEPTION 'AI document replacement requires chunks';
      END IF;
      INSERT INTO public.ai_source_documents(
        source_type,source_key,organization_id,team_id,project_id,task_id,note_id,attachment_id,
        title,content,content_hash,source_updated_at,stale_at,updated_at
      ) VALUES (
        doc->>'sourceType',doc->>'sourceKey',canonical_org,canonical_team,canonical_project,
        nullif(doc->>'taskId','')::uuid,nullif(doc->>'noteId','')::uuid,nullif(doc->>'attachmentId','')::uuid,
        coalesce(doc->>'title',''),doc->>'content',doc->>'contentHash',(doc->>'sourceUpdatedAt')::timestamptz,NULL,now()
      ) ON CONFLICT(source_type,source_key) DO UPDATE SET
        organization_id=EXCLUDED.organization_id,team_id=EXCLUDED.team_id,project_id=EXCLUDED.project_id,
        task_id=EXCLUDED.task_id,note_id=EXCLUDED.note_id,attachment_id=EXCLUDED.attachment_id,
        title=EXCLUDED.title,content=EXCLUDED.content,content_hash=EXCLUDED.content_hash,
        source_updated_at=EXCLUDED.source_updated_at,stale_at=NULL,updated_at=now(),
        source_revision=CASE WHEN ai_source_documents.content_hash IS DISTINCT FROM EXCLUDED.content_hash
          OR ai_source_documents.organization_id IS DISTINCT FROM EXCLUDED.organization_id
          OR ai_source_documents.team_id IS DISTINCT FROM EXCLUDED.team_id
          OR ai_source_documents.project_id IS DISTINCT FROM EXCLUDED.project_id
          THEN ai_source_documents.source_revision+1 ELSE ai_source_documents.source_revision END
      RETURNING id INTO document_id;
      DELETE FROM public.ai_chunks WHERE source_document_id=document_id;
      FOR chunk IN SELECT value FROM jsonb_array_elements(doc->'chunks') LOOP
        expected_id:=encode(extensions.digest(concat_ws(':',doc->>'sourceType',doc->>'sourceKey',doc->>'indexVersion',
          doc->>'embeddingModel',chunk->>'ordinal',chunk->>'contentHash'),'sha256'),'hex');
        IF chunk->>'id' IS DISTINCT FROM expected_id OR chunk->>'contentHash' !~ '^[0-9a-f]{64}$'
           OR jsonb_typeof(chunk->'embedding')<>'array' OR jsonb_array_length(chunk->'embedding')<>1024 THEN
          RAISE EXCEPTION 'Invalid deterministic AI chunk';
        END IF;
        INSERT INTO public.ai_chunks(
          id,source_document_id,organization_id,team_id,project_id,index_version,embedding_model,
          chunk_ordinal,content,content_hash,token_estimate,embedding
        ) VALUES (
          chunk->>'id',document_id,canonical_org,canonical_team,canonical_project,
          doc->>'indexVersion',doc->>'embeddingModel',(chunk->>'ordinal')::integer,
          chunk->>'content',chunk->>'contentHash',(chunk->>'tokenEstimate')::integer,
          (chunk->>'embedding')::extensions.vector(1024)
        );
      END LOOP;
      UPDATE public.ai_source_documents SET active_index_version=doc->>'indexVersion',
        active_embedding_model=doc->>'embeddingModel',indexed_at=now() WHERE id=document_id;
    END IF;
  END LOOP;

  IF job.source_type='task' THEN
    DELETE FROM public.ai_source_documents WHERE task_id=job.source_key::uuid
      AND source_type IN ('action','checklist') AND NOT(source_key=ANY(keep_keys));
  ELSE
    DELETE FROM public.ai_source_documents WHERE source_type=CASE job.source_type
      WHEN 'note' THEN 'note' WHEN 'process' THEN 'process' ELSE 'attachment' END
      AND source_key=job.source_key AND NOT(source_key=ANY(keep_keys));
  END IF;

  SELECT generation INTO current_generation FROM public.ai_index_jobs WHERE id=job.id;
  IF current_generation=p_generation THEN
    UPDATE public.ai_index_jobs SET status='completed',lease_token=NULL,leased_until=NULL,
      last_error_code=NULL,last_error_message=NULL,completed_at=now(),updated_at=now() WHERE id=job.id;
    RETURN 'completed';
  END IF;
  UPDATE public.ai_index_jobs SET status='pending',lease_token=NULL,leased_until=NULL,
    available_at=now(),updated_at=now() WHERE id=job.id;
  UPDATE public.ai_source_documents SET stale_at=now(),updated_at=now() WHERE
    (job.source_type='task' AND task_id=job.source_key::uuid) OR
    (job.source_type<>'task' AND source_key=job.source_key);
  RETURN 'superseded';
END $$;

CREATE OR REPLACE FUNCTION public.ai_user_can_access_source(
  p_user_id uuid,p_source_document_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.ai_source_documents d
    JOIN public.users u ON u.id=p_user_id AND u.organization_id=d.organization_id
    LEFT JOIN public.projects p ON p.id=d.project_id
    WHERE d.id=p_source_document_id AND d.stale_at IS NULL
      AND (
        d.team_id IS NULL OR u.role IN ('owner','admin') OR EXISTS(
          SELECT 1 FROM public.team_members tm WHERE tm.team_id=d.team_id AND tm.user_id=u.id
        )
      )
      AND (
        d.project_id IS NULL OR
        (p.organization_id=d.organization_id AND (p.team_id IS NULL OR p.team_id=d.team_id) AND (
          p.visibility='team' OR
          (p.visibility='restricted' AND EXISTS(SELECT 1 FROM public.project_members pm WHERE pm.project_id=p.id AND pm.user_id=u.id)) OR
          (p.visibility='private' AND (p.created_by=u.id OR EXISTS(SELECT 1 FROM public.project_members pm WHERE pm.project_id=p.id AND pm.user_id=u.id)))
        ))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.enqueue_ai_index_job(text,text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_index_jobs(integer,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_ai_index_job(bigint,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apply_ai_index_result(bigint,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_user_can_access_source(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_task_index_outbox() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_note_index_outbox() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_process_index_outbox() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_attachment_index_outbox() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_attachment_link_index_outbox() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_index_job(text,text,text,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_index_jobs(integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_ai_index_job(bigint,uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_ai_index_result(bigint,uuid,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_can_access_source(uuid,uuid) TO service_role;

COMMENT ON TABLE public.ai_source_documents IS 'Rebuildable AI projection; canonical Actions, checklist JSON and Notes remain source of truth.';
COMMENT ON COLUMN public.ai_source_documents.stale_at IS 'Non-null immediately hides content after a canonical mutation until a successful reindex.';
COMMENT ON TABLE public.ai_index_jobs IS 'Transactional outbox with generation fencing, leases, retry and dead-letter state.';

COMMIT;
