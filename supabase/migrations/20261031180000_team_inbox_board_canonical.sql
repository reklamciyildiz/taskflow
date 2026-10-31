-- Phase 1: a single server-owned Inbox board per team, shared by web/Android/iOS.
-- Additive migration only. No Action moves, status rewrites, stage ID regeneration,
-- automatic import or changes to existing Process definitions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.team_inbox_boards (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stages jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_inbox_board_stages_valid CHECK (public.a1_valid_stage_config(stages))
);

-- Stage IDs are immutable references once used by Actions. A browser may have
-- unique legacy IDs, so never infer stage identities from labels/positions.
CREATE OR REPLACE FUNCTION public.guard_team_inbox_board()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE team_org uuid;
BEGIN
  SELECT organization_id INTO team_org FROM public.teams WHERE id = NEW.team_id FOR SHARE;
  IF team_org IS NULL OR team_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Inbox integrity: team/organization mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.version IS DISTINCT FROM OLD.version + 1) THEN
    RAISE EXCEPTION 'Inbox integrity: ownership is immutable and versions must increment once' USING ERRCODE = '23514';
  END IF;
  IF NOT public.a1_valid_stage_config(NEW.stages) THEN
    RAISE EXCEPTION 'Inbox integrity: invalid stage configuration' USING ERRCODE = '23514';
  END IF;
  -- Refuse installation/removal if any saved General Action would become orphaned.
  -- No silent repairs. Import original stage identities first.
  IF EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.team_id = NEW.team_id AND t.project_id IS NULL
      AND (t.organization_id IS DISTINCT FROM NEW.organization_id
        OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.stages) s WHERE s->>'id' = t.status))
  ) THEN
    RAISE EXCEPTION 'Inbox integrity: saved Actions reference stages missing from proposed Inbox configuration'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_inbox_board_guard ON public.team_inbox_boards;
CREATE TRIGGER team_inbox_board_guard
  BEFORE INSERT OR UPDATE ON public.team_inbox_boards
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_inbox_board();

-- Protect new Action writes once an Inbox board has been activated.
-- Existing General Actions are NOT rewritten or validated until explicitly changed.
CREATE OR REPLACE FUNCTION public.guard_canonical_inbox_task_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE board_stages jsonb;
BEGIN
  IF NEW.project_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT stages INTO board_stages FROM public.team_inbox_boards
    WHERE team_id = NEW.team_id AND organization_id = NEW.organization_id FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF; -- Before explicit Inbox adoption: legacy behavior.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(board_stages) s WHERE s->>'id' = NEW.status) THEN
    RAISE EXCEPTION 'Inbox integrity: Action stage is not defined on the team Inbox board'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS canonical_inbox_task_stage ON public.tasks;
CREATE TRIGGER canonical_inbox_task_stage
  BEFORE INSERT OR UPDATE OF status, project_id, team_id, organization_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_inbox_task_stage();

-- Next.js server-side ACL is the only access path. Direct client JWTs are denied.
ALTER TABLE public.team_inbox_boards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_inbox_boards FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_inbox_boards TO service_role;
REVOKE ALL ON FUNCTION public.guard_team_inbox_board(), public.guard_canonical_inbox_task_stage()
  FROM PUBLIC, anon, authenticated;

COMMIT;
