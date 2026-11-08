-- Non-destructive Actiproc Free/Individual seat policy migration.
-- Must follow already-applied 20261108160000_actiproc_entitlement_invite_atomicity.sql.
-- Existing memberships are NEVER deleted or rewritten. Over-cap legacy Free
-- organizations retain access to their current data but cannot add seats.
-- Individual is billed per verified purchased seat, annually ($12/seat/year).
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.actiproc_effective_plan_seats(organizations)') IS NULL
    OR to_regprocedure('public.reserve_creem_seat_change(uuid,text,integer,integer,boolean,text)') IS NULL
    OR to_regclass('public.creem_plan_changes') IS NULL
    OR to_regclass('public.creem_seat_changes') IS NULL THEN
  RAISE EXCEPTION 'ACTIPROC_SEATS_MIGRATION_PREREQUISITES_MISSING';
 END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.actiproc_effective_plan_seats(
  p_org public.organizations
) RETURNS TABLE(effective_plan text, seat_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_plan text := 'free';
  v_seats integer := 1;
  v_previous_plan text;
  v_pending_previous integer;
BEGIN
  IF p_org.id IS NULL THEN
    RAISE EXCEPTION 'ACTIPROC_ORG_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_org.plan_name IN ('individual', 'pro', 'team')
    AND NOT COALESCE(p_org.creem_payment_hold, FALSE)
    AND NOT (
      p_org.billing_provider = 'creem'
      AND p_org.creem_subscription_id IS NOT NULL
      AND p_org.creem_test_mode IS DISTINCT FROM FALSE
    )
    AND (
      (COALESCE(p_org.subscription_status, 'active') IN ('active', 'trialing')
       AND (p_org.subscription_ends_at IS NULL OR p_org.subscription_ends_at > CURRENT_TIMESTAMP))
      OR (p_org.subscription_status = 'cancelled'
          AND p_org.subscription_ends_at > CURRENT_TIMESTAMP)
    )
  THEN
    v_plan := p_org.plan_name;
  END IF;

  -- A Creem plan may appear on the organization row before its charge is settled.
  -- Never grant desired-plan capacity while a matching plan lease is unresolved.
  IF p_org.billing_provider = 'creem' AND p_org.creem_subscription_id IS NOT NULL THEN
    SELECT pc.previous_plan INTO v_previous_plan
    FROM public.creem_plan_changes pc
    WHERE pc.organization_id = p_org.id
      AND pc.status IN ('pending', 'awaiting_sync', 'review')
      AND pc.desired_plan = v_plan;
    IF FOUND THEN
      v_plan := v_previous_plan;
    END IF;
  END IF;

  v_seats := CASE v_plan
    WHEN 'free' THEN 1
    WHEN 'individual' THEN
      CASE WHEN p_org.creem_subscription_id IS NOT NULL
                 OR p_org.ls_subscription_id IS NOT NULL
           THEN GREATEST(1, COALESCE(p_org.seat_limit, 1))
           ELSE 1 END -- Manual / legacy Individual remains single-seat.
    WHEN 'pro' THEN GREATEST(1, COALESCE(p_org.seat_limit, 1))
    WHEN 'team' THEN
      CASE WHEN p_org.creem_subscription_id IS NULL
                 AND p_org.ls_subscription_id IS NULL
           THEN NULL -- Preserve existing manual/developer Team unlimited seats.
           ELSE GREATEST(1, COALESCE(p_org.seat_limit, 1)) END
    ELSE 1
  END;

  -- A pending paid seat increase does not provision newly purchased seats yet.
  IF v_plan IN ('individual', 'pro', 'team')
     AND p_org.billing_provider = 'creem'
     AND p_org.creem_subscription_id IS NOT NULL THEN
    SELECT MIN(sc.previous_seats) INTO v_pending_previous
    FROM public.creem_seat_changes sc
    WHERE sc.organization_id = p_org.id
      AND sc.status IN ('pending', 'awaiting_sync', 'review')
      AND sc.desired_seats > sc.previous_seats;
    IF v_pending_previous IS NOT NULL THEN
      v_seats := LEAST(COALESCE(v_seats, v_pending_previous), v_pending_previous);
    END IF;
  END IF;

  RETURN QUERY SELECT v_plan, v_seats;
END;
$$;
REVOKE ALL ON FUNCTION public.actiproc_effective_plan_seats(public.organizations)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actiproc_effective_plan_seats(public.organizations)
  TO service_role;


CREATE OR REPLACE FUNCTION public.reserve_creem_seat_change(
  p_org UUID,p_subscription TEXT,p_previous INTEGER,p_desired INTEGER,p_test BOOLEAN,p_before_transaction TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_org public.organizations%ROWTYPE;
DECLARE token UUID;
BEGIN
 SELECT * INTO current_org FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND OR p_previous IS NULL OR p_desired IS NULL OR
    p_previous NOT BETWEEN 1 AND 500 OR p_desired NOT BETWEEN 1 AND 500 OR
    p_previous=p_desired OR p_test IS NULL OR
    current_org.billing_provider IS DISTINCT FROM 'creem' OR
    current_org.ls_subscription_id IS NOT NULL OR
    current_org.plan_name NOT IN ('individual','pro','team') OR
    current_org.subscription_status IS DISTINCT FROM 'active' OR
    current_org.creem_payment_hold IS DISTINCT FROM FALSE OR
    current_org.creem_subscription_id IS DISTINCT FROM p_subscription OR
    current_org.creem_test_mode IS DISTINCT FROM p_test OR
    current_org.seat_limit IS DISTINCT FROM p_previous
 THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.creem_plan_changes
    WHERE organization_id=p_org AND status IN ('pending','awaiting_sync','review'))
  THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.creem_seat_changes
   WHERE organization_id=p_org AND status IN ('pending','awaiting_sync','review'))
 THEN RETURN NULL; END IF;
 INSERT INTO public.creem_seat_changes
   (organization_id,subscription_id,previous_seats,desired_seats,test_mode,previous_transaction_id)
 VALUES (p_org,p_subscription,p_previous,p_desired,p_test,p_before_transaction)
 RETURNING id INTO token;
 RETURN token;
EXCEPTION WHEN unique_violation THEN
 RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.reserve_creem_seat_change(UUID,TEXT,INTEGER,INTEGER,BOOLEAN,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creem_seat_change(UUID,TEXT,INTEGER,INTEGER,BOOLEAN,TEXT)
  TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
