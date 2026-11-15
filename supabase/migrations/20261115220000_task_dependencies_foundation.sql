-- P2.3.1 Smart Dependencies — staged migration only.
-- Requires the P0 completed_at migration (actiproc_is_terminal_task_stage).
-- No existing Action or schedule data is changed.
BEGIN;
CREATE TABLE public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  blocker_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  blocked_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p23_dependency_not_self CHECK (blocker_task_id <> blocked_task_id),
  CONSTRAINT p23_dependency_unique UNIQUE (blocker_task_id, blocked_task_id)
);
CREATE INDEX p23_dependency_blocker_idx ON public.task_dependencies(organization_id,blocker_task_id);
CREATE INDEX p23_dependency_blocked_idx ON public.task_dependencies(organization_id,blocked_task_id);
CREATE INDEX p23_dependency_team_idx ON public.task_dependencies(team_id,blocked_task_id);
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_dependencies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.task_dependencies TO service_role;

-- Same tenant-wide transaction advisory lock is used for graph writes, task
-- terminal transitions and new recurring schedules. Concurrent operations
-- serialize under PostgreSQL READ COMMITTED (the PostgREST default).
CREATE FUNCTION public.p23_lock_graph(p_org uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text, 20261115));
END; $$;
REVOKE ALL ON FUNCTION public.p23_lock_graph(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p23_lock_graph(uuid) TO service_role;

CREATE FUNCTION public.p23_guard_dependency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a record; b record;
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.p23_lock_graph(OLD.organization_id);
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'P23_DEPENDENCY_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.blocker_task_id=NEW.blocked_task_id THEN
    RAISE EXCEPTION 'P23_DEPENDENCY_SELF' USING ERRCODE='23514';
  END IF;
  -- Read initial org before lock; never trust client-supplied scope fields.
  SELECT organization_id,team_id,status,project_id INTO a FROM public.tasks WHERE id=NEW.blocker_task_id;
  SELECT organization_id,team_id,status,project_id INTO b FROM public.tasks WHERE id=NEW.blocked_task_id;
  IF a.organization_id IS NULL OR b.organization_id IS NULL
     OR a.organization_id<>b.organization_id OR a.team_id<>b.team_id THEN
    RAISE EXCEPTION 'P23_DEPENDENCY_SCOPE' USING ERRCODE='23514';
  END IF;
  PERFORM public.p23_lock_graph(b.organization_id);
  -- Fresh snapshot after waiting for lock; do NOT lock task rows here, since
  -- concurrent task updates may already hold one before taking the graph lock.
  SELECT organization_id,team_id,status,project_id INTO a FROM public.tasks WHERE id=NEW.blocker_task_id;
  SELECT organization_id,team_id,status,project_id INTO b FROM public.tasks WHERE id=NEW.blocked_task_id;
  IF a.organization_id IS NULL OR b.organization_id IS NULL
     OR a.organization_id<>b.organization_id OR a.team_id<>b.team_id THEN
    RAISE EXCEPTION 'P23_DEPENDENCY_SCOPE' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.work_schedules ws
    WHERE ws.task_id IN (NEW.blocker_task_id,NEW.blocked_task_id)
      AND ws.checklist_item_id IS NULL AND ws.schedule_type='recurring'
      AND ws.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'P23_DEPENDENCY_RECURRING' USING ERRCODE='23514'; END IF;
  IF public.actiproc_is_terminal_task_stage(b.project_id,b.status)
    AND NOT public.actiproc_is_terminal_task_stage(a.project_id,a.status) THEN
    RAISE EXCEPTION 'P23_DEPENDENCY_TERMINAL_TARGET' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.task_dependencies WHERE blocked_task_id=NEW.blocked_task_id)>=200
    OR (SELECT count(*) FROM public.task_dependencies WHERE blocker_task_id=NEW.blocker_task_id)>=200 THEN
    RAISE EXCEPTION 'P23_DEPENDENCY_LIMIT' USING ERRCODE='23514';
  END IF;
  -- Directed blocker -> blocked graph. Reject if blocked reaches blocker.
  IF EXISTS (
    WITH RECURSIVE reachable(task_id) AS (
      SELECT NEW.blocked_task_id
      UNION
      SELECT d.blocked_task_id FROM public.task_dependencies d
      JOIN reachable r ON r.task_id=d.blocker_task_id
      WHERE d.organization_id=b.organization_id
    ) SELECT 1 FROM reachable WHERE task_id=NEW.blocker_task_id
  ) THEN RAISE EXCEPTION 'P23_DEPENDENCY_CYCLE' USING ERRCODE='23514'; END IF;
  NEW.organization_id:=b.organization_id;
  NEW.team_id:=b.team_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER p23_dependency_integrity BEFORE INSERT OR UPDATE OR DELETE
  ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION public.p23_guard_dependency();

CREATE FUNCTION public.p23_guard_task_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE was_terminal boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (OLD.organization_id IS DISTINCT FROM NEW.organization_id
        OR OLD.team_id IS DISTINCT FROM NEW.team_id)
      AND EXISTS (SELECT 1 FROM public.task_dependencies d
        WHERE d.blocker_task_id=NEW.id OR d.blocked_task_id=NEW.id) THEN
      RAISE EXCEPTION 'P23_DEPENDENCY_SCOPE_CHANGE' USING ERRCODE='23514';
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status
      AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
  END IF;
  IF NOT public.actiproc_is_terminal_task_stage(NEW.project_id,NEW.status) THEN RETURN NEW; END IF;
  was_terminal:=FALSE;
  IF TG_OP='UPDATE' THEN
    was_terminal:=public.actiproc_is_terminal_task_stage(OLD.project_id,OLD.status);
  END IF;
  -- Preserve historical completion when moving between terminal stages, even
  -- if a previously completed blocker has since been reopened.
  IF was_terminal THEN RETURN NEW; END IF;
  PERFORM public.p23_lock_graph(NEW.organization_id);
  IF EXISTS (
    SELECT 1 FROM public.task_dependencies d JOIN public.tasks blocker ON blocker.id=d.blocker_task_id
    WHERE d.blocked_task_id=NEW.id
      AND NOT public.actiproc_is_terminal_task_stage(blocker.project_id,blocker.status)
  ) THEN RAISE EXCEPTION 'P23_BLOCKED_COMPLETION' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER p23_tasks_completion_integrity
  BEFORE INSERT OR UPDATE OF status,project_id,team_id,organization_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.p23_guard_task_completion();

-- Recurrence is occurrence-specific; Action-level edges cannot model it yet.
CREATE FUNCTION public.p23_guard_recurring_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid;
BEGIN
  IF NEW.schedule_type<>'recurring' OR NEW.archived_at IS NOT NULL
     OR NEW.checklist_item_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT organization_id INTO org FROM public.tasks WHERE id=NEW.task_id;
  IF org IS NULL THEN RETURN NEW; END IF;
  PERFORM public.p23_lock_graph(org);
  IF EXISTS (SELECT 1 FROM public.task_dependencies d
    WHERE d.blocker_task_id=NEW.task_id OR d.blocked_task_id=NEW.task_id) THEN
    RAISE EXCEPTION 'P23_DEPENDENCY_RECURRING' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER p23_work_schedule_integrity
  BEFORE INSERT OR UPDATE OF schedule_type,archived_at,task_id,checklist_item_id
  ON public.work_schedules FOR EACH ROW EXECUTE FUNCTION public.p23_guard_recurring_schedule();
REVOKE ALL ON FUNCTION public.p23_guard_dependency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p23_guard_task_completion() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p23_guard_recurring_schedule() FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.task_dependencies IS
  'P2.3.1 same-team Finish-to-Start dependencies; blocked Actions remain editable but cannot newly enter terminal stages.';
COMMIT;
