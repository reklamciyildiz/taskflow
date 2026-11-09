-- Connected Notes V1: explicit, scoped links between Notes and stable TipTap checklist IDs.
-- Additive only. No existing notes or checklist JSON is rewritten by this migration.
BEGIN;

CREATE TABLE public.note_checklist_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  checklist_item_id text NOT NULL CHECK (
    char_length(checklist_item_id) BETWEEN 1 AND 200
    AND checklist_item_id = btrim(checklist_item_id)
  ),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT note_checklist_links_unique UNIQUE (note_id, task_id, checklist_item_id)
);

CREATE INDEX note_checklist_links_task_item_idx
  ON public.note_checklist_links(task_id, checklist_item_id);
CREATE INDEX note_checklist_links_organization_idx
  ON public.note_checklist_links(organization_id, task_id);
CREATE INDEX note_checklist_links_note_idx
  ON public.note_checklist_links(note_id);

-- JSON IDs are not FK targets. A database check is essential because direct
-- service-role writes must not circumvent the API's existence validation.
CREATE OR REPLACE FUNCTION public.note_checklist_item_exists(
  p_document jsonb, p_item_id text
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_path_exists(
    coalesce(p_document, '{}'::jsonb),
    '$.** ? (@.type == "taskItem" && @.attrs.id == $target)',
    jsonb_build_object('target', p_item_id)
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.guard_note_checklist_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_note record;
  v_task record;
BEGIN
  -- Row locking serializes link creation with checklist edits/deletion. The
  -- AFTER UPDATE cleanup below cannot miss a concurrently inserted link.
  SELECT id, organization_id, team_id, checklist_blocks
    INTO v_task FROM public.tasks WHERE id = NEW.task_id FOR UPDATE;
  SELECT id, task_id, organization_id, team_id
    INTO v_note FROM public.notes WHERE id = NEW.note_id FOR KEY SHARE;

  IF v_task.id IS NULL OR v_note.id IS NULL
     OR v_note.task_id <> v_task.id
     OR v_note.organization_id <> v_task.organization_id
     OR v_note.team_id <> v_task.team_id THEN
    RAISE EXCEPTION 'Note and checklist must belong to the same Action'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.note_checklist_item_exists(
    v_task.checklist_blocks, NEW.checklist_item_id
  ) THEN
    RAISE EXCEPTION 'Checklist item does not exist in the parent Action'
      USING ERRCODE = '23514';
  END IF;
  NEW.organization_id := v_task.organization_id;
  NEW.team_id := v_task.team_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER note_checklist_links_guard
  BEFORE INSERT OR UPDATE ON public.note_checklist_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_note_checklist_link();

-- Editing a checklist item, changing its order, or changing its checked state
-- keeps its link. Removing an item clears only links, never the original Note.
CREATE OR REPLACE FUNCTION public.cleanup_removed_note_checklist_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.checklist_blocks IS DISTINCT FROM NEW.checklist_blocks THEN
    DELETE FROM public.note_checklist_links AS link
    WHERE link.task_id = NEW.id
      AND NOT public.note_checklist_item_exists(
        NEW.checklist_blocks, link.checklist_item_id
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER note_checklist_links_prune_deleted_items
  AFTER UPDATE OF checklist_blocks ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_removed_note_checklist_links();

-- All reads/writes go through authenticated, ACL-scoped Next.js APIs. No
-- browser JWT is permitted to query this join table directly.
ALTER TABLE public.note_checklist_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.note_checklist_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.note_checklist_links TO service_role;

COMMENT ON TABLE public.note_checklist_links IS
  'Same-Action Note ↔ checklist item links; Notes remain independent and reusable within their Action.';

COMMIT;
