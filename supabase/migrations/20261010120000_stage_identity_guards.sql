-- Foundation A1: integrity guards only. No data conversion or relational stage cutover.
BEGIN;

CREATE OR REPLACE FUNCTION public.a1_valid_stage_config(config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE entry jsonb; seen text[] := '{}';
BEGIN
  IF config IS NULL OR jsonb_typeof(config) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(config) = 0 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(config) LOOP
    IF jsonb_typeof(entry) <> 'object'
      OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string'
      OR btrim(entry->>'id') = ''
      OR jsonb_typeof(entry->'title') IS DISTINCT FROM 'string'
      OR btrim(entry->>'title') = ''
      OR (entry ? 'color' AND jsonb_typeof(entry->'color') <> 'string')
      OR (entry ? 'isTerminal' AND jsonb_typeof(entry->'isTerminal') <> 'boolean')
      OR entry->>'id' = ANY(seen) THEN RETURN false;
    END IF;
    seen := array_append(seen, entry->>'id');
  END LOOP;
  RETURN true;
END $$;

-- Deliberately no scan/backfill: existing bad records are reported by the read-only preflight.
-- Existing content remains editable; only new assignments/schema mutations are guarded.
CREATE OR REPLACE FUNCTION public.a1_guard_task_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE process public.projects%ROWTYPE;
BEGIN
  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id AND NEW.status IS NOT DISTINCT FROM OLD.status
      AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
      THEN RETURN NEW; END IF;
  END IF;
  -- Conflicts with config UPDATE's row lock, preventing insert/delete-column races.
  SELECT * INTO process FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  IF NOT FOUND OR process.organization_id IS DISTINCT FROM NEW.organization_id
    OR (process.team_id IS NOT NULL AND process.team_id IS DISTINCT FROM NEW.team_id) THEN
    RAISE EXCEPTION 'Stage integrity: process does not belong to Action scope' USING ERRCODE = '23514';
  END IF;
  IF NOT public.a1_valid_stage_config(process.column_config) THEN
    RAISE EXCEPTION 'Stage integrity: repair the process configuration before assigning Actions' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(process.column_config) c WHERE c->>'id' = NEW.status) THEN
    RAISE EXCEPTION 'Stage integrity: status is not defined in this process' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.a1_guard_project_stages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.column_config IS NOT DISTINCT FROM OLD.column_config
      AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
      THEN RETURN NEW; END IF;
  END IF;
  IF NOT public.a1_valid_stage_config(NEW.column_config) THEN
    RAISE EXCEPTION 'Stage integrity: stages need unique non-empty IDs, titles and valid metadata' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.project_id = NEW.id AND (
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.column_config) c WHERE c->>'id' = t.status)
      OR t.organization_id IS DISTINCT FROM NEW.organization_id
      OR (NEW.team_id IS NOT NULL AND t.team_id IS DISTINCT FROM NEW.team_id)
    )
  ) THEN
    RAISE EXCEPTION 'Stage integrity: referenced stages cannot be removed or moved out of Action scope; move Actions explicitly first' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS a1_task_stage_integrity ON public.tasks;
CREATE TRIGGER a1_task_stage_integrity BEFORE INSERT OR UPDATE OF status, project_id, team_id, organization_id
ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.a1_guard_task_stage();
DROP TRIGGER IF EXISTS a1_project_stage_integrity ON public.projects;
CREATE TRIGGER a1_project_stage_integrity BEFORE INSERT OR UPDATE OF column_config, team_id, organization_id
ON public.projects FOR EACH ROW EXECUTE FUNCTION public.a1_guard_project_stages();
REVOKE ALL ON FUNCTION public.a1_guard_task_stage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.a1_guard_project_stages() FROM PUBLIC;
COMMIT;
