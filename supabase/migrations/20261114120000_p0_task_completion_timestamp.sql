-- P0: Accurate completion timestamps. Apply to staging before web deployment.
-- No historical backfill. updated_at cannot prove an Action was completed.
BEGIN;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
COMMENT ON COLUMN public.tasks.completed_at IS 'Most recent transition into a terminal stage; NULL for open or historical/unknown completions. Never derived from updated_at.';

-- General Actions use the canonical default "done". Per-team customized general-board
-- columns currently live client-side, not in a server table; they cannot be inferred here.
CREATE OR REPLACE FUNCTION public.actiproc_is_terminal_task_stage(
  p_project_id uuid, p_status text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE v_terminal boolean;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN p_status = 'done';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.projects p,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.column_config)='array'
          THEN p.column_config ELSE '[]'::jsonb END
      ) AS stage
    WHERE p.id=p_project_id
      AND stage->>'id'=p_status
      AND stage->>'isTerminal'='true'
  ) INTO v_terminal;
  RETURN coalesce(v_terminal,false);
END $$;

CREATE OR REPLACE FUNCTION public.actiproc_record_task_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE v_was_terminal boolean;
DECLARE v_is_terminal boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
      NEW.completed_at:=OLD.completed_at;
      RETURN NEW;
    END IF;
  END IF;
  v_is_terminal:=public.actiproc_is_terminal_task_stage(NEW.project_id,NEW.status);
  IF TG_OP='INSERT' THEN
    NEW.completed_at:=CASE WHEN v_is_terminal THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  v_was_terminal:=public.actiproc_is_terminal_task_stage(OLD.project_id,OLD.status);

  IF NOT v_is_terminal THEN
    -- Reopening resets the current cycle. A later re-completion gets a new timestamp.
    NEW.completed_at:=NULL;
  ELSIF NOT v_was_terminal THEN
    -- The database, not the browser clock, is authoritative.
    NEW.completed_at:=now();
  ELSE
    -- Terminal-to-terminal edit, title change, etc: preserve the original completion.
    -- For legacy completed Actions with unknown timestamps, keep NULL.
    NEW.completed_at:=OLD.completed_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS actiproc_tasks_completed_at_guard ON public.tasks;
CREATE TRIGGER actiproc_tasks_completed_at_guard
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.actiproc_record_task_completion();

-- Intentionally do not backfill old completed rows: their true completion time is unknown.
CREATE INDEX IF NOT EXISTS actiproc_tasks_completed_at_idx
  ON public.tasks(organization_id,completed_at DESC)
  WHERE completed_at IS NOT NULL;

COMMIT;
