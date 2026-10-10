-- Manual rollout only after A1 production checks. No Stage cutover or Action backfill.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.a1_valid_stage_config(jsonb)') IS NULL OR
    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A')
      AND ((tgrelid = 'public.tasks'::regclass AND tgname = 'a1_task_stage_integrity'
            AND tgfoid = to_regprocedure('public.a1_guard_task_stage()'))
        OR (tgrelid = 'public.projects'::regclass AND tgname = 'a1_project_stage_integrity'
            AND tgfoid = to_regprocedure('public.a1_guard_project_stages()')))) <> 2 THEN
    RAISE EXCEPTION 'Properties rollout aborted: verify and install active A1 guards first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE NOT public.a1_valid_stage_config(column_config)) THEN
    RAISE EXCEPTION 'Properties rollout aborted: malformed/duplicate process stages; run A1 preflight';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks t LEFT JOIN public.projects p ON p.id=t.project_id
    WHERE t.project_id IS NOT NULL AND (p.id IS NULL
      OR t.organization_id IS DISTINCT FROM p.organization_id
      OR (p.team_id IS NOT NULL AND p.team_id IS DISTINCT FROM t.team_id)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.column_config) c WHERE c->>'id'=t.status))) THEN
    RAISE EXCEPTION 'Properties rollout aborted: scoped orphan/scope mismatch; run A1 preflight';
  END IF;
END $$;

CREATE TABLE public.process_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  type text NOT NULL DEFAULT 'single_select' CHECK (type = 'single_select'),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, project_id)
);
CREATE TABLE public.process_property_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  property_id uuid NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  color text NOT NULL DEFAULT 'slate' CHECK (color IN ('slate','blue','green','amber','rose','violet')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(property_id, project_id) REFERENCES public.process_properties(id, project_id) ON DELETE CASCADE,
  UNIQUE(id, property_id, project_id)
);
-- Composite FK enforces source ownership without a second tenant source of truth.
ALTER TABLE public.tasks ADD CONSTRAINT tasks_id_project_properties_key UNIQUE(id, project_id);
CREATE TABLE public.action_property_values (
  task_id uuid NOT NULL,
  project_id uuid NOT NULL,
  property_id uuid NOT NULL,
  option_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id, property_id),
  -- Process deletion SET NULLs tasks before cascading definitions; check the final
  -- transaction state so the existing parent-delete behavior remains valid.
  FOREIGN KEY(task_id, project_id) REFERENCES public.tasks(id, project_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(option_id, property_id, project_id)
    REFERENCES public.process_property_options(id, property_id, project_id) ON DELETE CASCADE
);
CREATE INDEX process_properties_order_idx ON public.process_properties(project_id, position, id);
CREATE INDEX process_property_options_order_idx ON public.process_property_options(property_id, position, id);
CREATE INDEX action_property_values_project_idx ON public.action_property_values(project_id, property_id, option_id);

CREATE FUNCTION public.guard_process_property_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent_archived timestamptz;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR (TG_TABLE_NAME='process_property_options' AND to_jsonb(NEW)->>'property_id' IS DISTINCT FROM to_jsonb(OLD)->>'property_id') THEN
      RAISE EXCEPTION 'Property identity and ownership are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived definitions are read-only' USING ERRCODE='23514';
    END IF;
  END IF;
  -- Serializes configuration changes, including reorder. Ownership stays on projects.
  PERFORM 1 FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  IF TG_TABLE_NAME='process_property_options' THEN
    SELECT archived_at INTO parent_archived FROM public.process_properties
      WHERE id=NEW.property_id AND project_id=NEW.project_id FOR SHARE;
    IF NOT FOUND OR parent_archived IS NOT NULL THEN
      RAISE EXCEPTION 'Property missing or archived' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END $$;
CREATE TRIGGER process_property_guard BEFORE INSERT OR UPDATE ON public.process_properties
FOR EACH ROW EXECUTE FUNCTION public.guard_process_property_write();
CREATE TRIGGER process_property_option_guard BEFORE INSERT OR UPDATE ON public.process_property_options
FOR EACH ROW EXECUTE FUNCTION public.guard_process_property_write();

CREATE FUNCTION public.guard_action_property_value() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE task_project uuid; prop_archived timestamptz; option_archived timestamptz;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN
    RAISE EXCEPTION 'Value ownership is immutable' USING ERRCODE='23514';
  END IF;
  SELECT project_id INTO task_project FROM public.tasks WHERE id=NEW.task_id FOR SHARE;
  IF task_project IS NULL OR task_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Property does not belong to this Action process' USING ERRCODE='23514';
  END IF;
  SELECT archived_at INTO prop_archived FROM public.process_properties
    WHERE id=NEW.property_id AND project_id=NEW.project_id FOR SHARE;
  IF NOT FOUND OR prop_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Property missing or archived' USING ERRCODE='23514';
  END IF;
  SELECT archived_at INTO option_archived FROM public.process_property_options
    WHERE id=NEW.option_id AND property_id=NEW.property_id AND project_id=NEW.project_id FOR SHARE;
  IF NOT FOUND OR option_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Option missing, archived or belongs to another property' USING ERRCODE='23514';
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END $$;
CREATE TRIGGER action_property_value_guard BEFORE INSERT OR UPDATE ON public.action_property_values
FOR EACH ROW EXECUTE FUNCTION public.guard_action_property_value();

-- Atomic ordering; reject stale lists rather than silently dropping newly added definitions.
CREATE FUNCTION public.reorder_process_property_items(p_project_id uuid, p_property_id uuid, p_ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actual uuid[];
BEGIN
  PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF p_property_id IS NULL THEN
    SELECT array_agg(id ORDER BY id) INTO actual FROM public.process_properties
      WHERE project_id=p_project_id AND archived_at IS NULL;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.process_properties WHERE id=p_property_id AND project_id=p_project_id AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'Property missing or archived' USING ERRCODE='23514';
    END IF;
    SELECT array_agg(id ORDER BY id) INTO actual FROM public.process_property_options
      WHERE property_id=p_property_id AND project_id=p_project_id AND archived_at IS NULL;
  END IF;
  IF coalesce(actual,'{}'::uuid[]) IS DISTINCT FROM
    coalesce((SELECT array_agg(id ORDER BY id) FROM unnest(p_ids) id),'{}'::uuid[]) THEN
    RAISE EXCEPTION 'Property order changed; refresh and retry' USING ERRCODE='23514';
  END IF;
  IF p_property_id IS NULL THEN
    UPDATE public.process_properties p SET position=u.ordinality-1 FROM unnest(p_ids) WITH ORDINALITY u(id,ordinality) WHERE p.id=u.id;
  ELSE
    UPDATE public.process_property_options o SET position=u.ordinality-1 FROM unnest(p_ids) WITH ORDINALITY u(id,ordinality) WHERE o.id=u.id;
  END IF;
END $$;

-- Same server-only pattern as Notes: NextAuth API authorization + deny direct JWT/anon access.
ALTER TABLE public.process_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_property_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_property_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.process_properties, public.process_property_options, public.action_property_values FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_properties, public.process_property_options, public.action_property_values TO service_role;
REVOKE ALL ON FUNCTION public.reorder_process_property_items(uuid,uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_process_property_items(uuid,uuid,uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.guard_process_property_write(), public.guard_action_property_value() FROM PUBLIC;
COMMIT;
