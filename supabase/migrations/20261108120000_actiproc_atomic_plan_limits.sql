-- Actiproc plan capacity — atomic database guard for concurrent inserts.
-- Additive and non-destructive. APPLY MANUALLY in Production after review.
-- This enforces capacity even for backend service_role writes (RLS bypass).
BEGIN;
CREATE OR REPLACE FUNCTION public.actiproc_enforce_entity_plan_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  billed_plan text;
  billed_status text;
  billed_end timestamptz;
  billed_provider text;
  billed_test_mode boolean;
  billed_hold boolean;
  effective_plan text := 'free';
  capacity integer;
  existing_count bigint;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('projects','teams')
     OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Invalid plan limit guard context' USING ERRCODE='P0001';
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization required' USING ERRCODE='23503';
  END IF;

  -- Serialize all same-organization creates. FOR NO KEY UPDATE is compatible
  -- with FK KEY SHARE locks, avoiding lock-upgrade deadlocks.
  SELECT plan_name, subscription_status, subscription_ends_at,
         billing_provider, creem_test_mode, creem_payment_hold
  INTO billed_plan, billed_status, billed_end, billed_provider,
       billed_test_mode, billed_hold
  FROM public.organizations
  WHERE id=NEW.organization_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE='23503';
  END IF;

  IF billed_plan IN ('individual','pro','team')
     AND NOT COALESCE(billed_hold,FALSE)
     AND NOT (billed_provider='creem' AND billed_test_mode IS DISTINCT FROM FALSE)
     AND (
        (billed_status IN ('active','trialing')
          AND (billed_end IS NULL OR billed_end > CURRENT_TIMESTAMP))
        OR (billed_status='cancelled' AND billed_end > CURRENT_TIMESTAMP)
     ) THEN
    effective_plan:=billed_plan;
  END IF;

  IF TG_TABLE_NAME='projects' THEN
    capacity:=CASE effective_plan
      WHEN 'free' THEN 1 WHEN 'individual' THEN 3 WHEN 'pro' THEN 10 ELSE NULL END;
    IF capacity IS NULL THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO existing_count FROM public.projects
      WHERE organization_id=NEW.organization_id;
  ELSE
    capacity:=CASE effective_plan
      WHEN 'free' THEN 1 WHEN 'individual' THEN 1 WHEN 'pro' THEN 3 ELSE NULL END;
    IF capacity IS NULL THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO existing_count FROM public.teams
      WHERE organization_id=NEW.organization_id;
  END IF;

  IF existing_count >= capacity THEN
    RAISE EXCEPTION 'ACTIPROC_PLAN_LIMIT: % limit of % reached',
      TG_TABLE_NAME,capacity USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.actiproc_enforce_entity_plan_limit()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_actiproc_projects_plan_limit ON public.projects;
CREATE TRIGGER trg_actiproc_projects_plan_limit
BEFORE INSERT ON public.projects FOR EACH ROW
EXECUTE FUNCTION public.actiproc_enforce_entity_plan_limit();

DROP TRIGGER IF EXISTS trg_actiproc_teams_plan_limit ON public.teams;
CREATE TRIGGER trg_actiproc_teams_plan_limit
BEFORE INSERT ON public.teams FOR EACH ROW
EXECUTE FUNCTION public.actiproc_enforce_entity_plan_limit();

COMMENT ON FUNCTION public.actiproc_enforce_entity_plan_limit() IS
'Serialized, per-organization INSERT plan caps for projects/teams. Existing over-cap data is retained after downgrade.';
COMMIT;
