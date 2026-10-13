BEGIN;

-- Private storage metadata. All access goes through NextAuth-authorized server commands.
CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  uploaded_by uuid NOT NULL REFERENCES public.users(id),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
  stored_bytes bigint,
  object_key text NOT NULL UNIQUE,
  thumbnail_key text,
  staging_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','deleting')),
  width integer,
  height integer,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_task ON public.attachments(task_id, created_at DESC);
CREATE INDEX attachments_quota ON public.attachments(organization_id);
CREATE INDEX attachments_cleanup ON public.attachments(status, updated_at);

CREATE TABLE public.attachment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES public.attachments(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  note_id uuid REFERENCES public.notes(id) ON DELETE CASCADE,
  checklist_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (note_id IS NULL OR checklist_item_id IS NULL)
);
CREATE UNIQUE INDEX attachment_links_action ON public.attachment_links(attachment_id,task_id) WHERE note_id IS NULL AND checklist_item_id IS NULL;
CREATE UNIQUE INDEX attachment_links_note ON public.attachment_links(attachment_id,note_id) WHERE note_id IS NOT NULL;
CREATE UNIQUE INDEX attachment_links_checklist ON public.attachment_links(attachment_id,task_id,checklist_item_id) WHERE checklist_item_id IS NOT NULL;
CREATE INDEX attachment_links_task ON public.attachment_links(task_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attachments, public.attachment_links FROM anon, authenticated;
GRANT ALL ON public.attachments, public.attachment_links TO service_role;

CREATE FUNCTION public.guard_attachment_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent public.tasks%ROWTYPE; reserved bigint;
BEGIN
  SELECT * INTO STRICT parent FROM public.tasks WHERE id = NEW.task_id FOR SHARE;
  NEW.organization_id := parent.organization_id;
  NEW.team_id := parent.team_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 1829));
  SELECT coalesce(sum(greatest(size_bytes,coalesce(stored_bytes,0))),0) INTO reserved
    FROM public.attachments WHERE organization_id = NEW.organization_id;
  IF reserved + NEW.size_bytes > 1073741824 THEN RAISE EXCEPTION 'Organization file quota exceeded (1 GiB)'; END IF;
  IF (SELECT count(*) FROM public.attachments WHERE uploaded_by = NEW.uploaded_by AND created_at > now()-interval '1 hour') >= 30
    THEN RAISE EXCEPTION 'Upload limit reached (30 per hour)'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_insert_guard BEFORE INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_insert();

CREATE FUNCTION public.guard_attachment_link() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE file public.attachments%ROWTYPE; parent public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO STRICT file FROM public.attachments WHERE id = NEW.attachment_id FOR UPDATE;
  SELECT * INTO STRICT parent FROM public.tasks WHERE id = NEW.task_id;
  IF file.status = 'deleting' OR file.task_id IS DISTINCT FROM NEW.task_id
    OR file.organization_id IS DISTINCT FROM parent.organization_id OR file.team_id IS DISTINCT FROM parent.team_id
    THEN RAISE EXCEPTION 'Invalid attachment scope'; END IF;
  IF NEW.note_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.notes WHERE id = NEW.note_id AND task_id = NEW.task_id)
    THEN RAISE EXCEPTION 'Note does not belong to Action'; END IF;
  IF NEW.checklist_item_id IS NOT NULL AND NOT jsonb_path_exists(coalesce(parent.checklist_blocks,'{}'::jsonb),
    '$.** ? (@.type == "taskItem" && @.attrs.id == $id)', jsonb_build_object('id',NEW.checklist_item_id))
    THEN RAISE EXCEPTION 'Checklist item does not belong to Action'; END IF;
  UPDATE public.attachments SET updated_at = now() WHERE id = file.id;
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_link_guard BEFORE INSERT OR UPDATE ON public.attachment_links FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_link();

CREATE FUNCTION public.touch_detached_attachment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  UPDATE public.attachments SET updated_at=now() WHERE id=OLD.attachment_id;
  RETURN OLD;
END $$;
CREATE TRIGGER touch_detached_attachment AFTER DELETE ON public.attachment_links FOR EACH ROW EXECUTE FUNCTION public.touch_detached_attachment();

CREATE FUNCTION public.guard_attachment_size() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE used bigint;
BEGIN
  IF NEW.stored_bytes IS DISTINCT FROM OLD.stored_bytes THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text,1829));
    SELECT coalesce(sum(greatest(size_bytes,coalesce(stored_bytes,0))),0) INTO used FROM public.attachments
      WHERE organization_id=NEW.organization_id AND id<>NEW.id;
    IF used+greatest(NEW.size_bytes,NEW.stored_bytes)>1073741824 THEN RAISE EXCEPTION 'Organization file quota exceeded'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_size_guard BEFORE UPDATE OF stored_bytes ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_size();

-- Inline references are validated and reconciled in the same transaction as Note autosave.
CREATE FUNCTION public.sync_note_attachments() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE node jsonb; file_id uuid; keep_ids uuid[] := '{}';
BEGIN
  FOR node IN SELECT jsonb_path_query(coalesce(NEW.content,'{}'::jsonb),'$.** ? (@.type == "attachment")') LOOP
    file_id := (node->'attrs'->>'attachmentId')::uuid;
    IF file_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.attachments WHERE id=file_id AND task_id=NEW.task_id AND status='ready')
      THEN RAISE EXCEPTION 'Invalid inline attachment reference'; END IF;
    keep_ids := array_append(keep_ids,file_id);
    INSERT INTO public.attachment_links(attachment_id,task_id,note_id) VALUES(file_id,NEW.task_id,NEW.id) ON CONFLICT DO NOTHING;
  END LOOP;
  DELETE FROM public.attachment_links WHERE note_id=NEW.id AND NOT(attachment_id=ANY(keep_ids));
  RETURN NEW;
END $$;
CREATE TRIGGER note_attachment_sync AFTER INSERT OR UPDATE OF content ON public.notes FOR EACH ROW EXECUTE FUNCTION public.sync_note_attachments();

CREATE FUNCTION public.attachment_task_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.team_id IS DISTINCT FROM OLD.team_id)
    AND EXISTS(SELECT 1 FROM public.attachments WHERE task_id=NEW.id)
    THEN RAISE EXCEPTION 'Remove or migrate Action files before changing organization/team'; END IF;
  DELETE FROM public.attachment_links WHERE task_id=NEW.id AND checklist_item_id IS NOT NULL
    AND NOT jsonb_path_exists(coalesce(NEW.checklist_blocks,'{}'::jsonb),
      '$.** ? (@.type == "taskItem" && @.attrs.id == $id)',jsonb_build_object('id',checklist_item_id));
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_task_lifecycle AFTER UPDATE OF checklist_blocks,organization_id,team_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.attachment_task_lifecycle();

-- Claim before object deletion. A link/finalize cannot resurrect a claimed file.
-- Seven-day grace allows editor undo/relink. Expired upload URLs cannot recreate cleaned staging objects.
CREATE FUNCTION public.claim_attachment_cleanup() RETURNS SETOF public.attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY WITH candidates AS (
    SELECT a.id FROM public.attachments a WHERE
      (a.task_id IS NULL AND a.created_at < now()-interval '24 hours') OR
      (a.status IN ('pending','processing') AND a.created_at < now()-interval '24 hours') OR
      (a.status='deleting' AND a.updated_at < now()-interval '10 minutes' AND a.created_at < now()-interval '1 hour') OR
      (a.status='ready' AND a.updated_at < now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM public.attachment_links l WHERE l.attachment_id=a.id))
    ORDER BY a.created_at LIMIT 50 FOR UPDATE OF a SKIP LOCKED
  ) UPDATE public.attachments a SET status='deleting',updated_at=now() FROM candidates c WHERE a.id=c.id RETURNING a.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_attachment_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_attachment_cleanup() TO service_role;
COMMIT;
