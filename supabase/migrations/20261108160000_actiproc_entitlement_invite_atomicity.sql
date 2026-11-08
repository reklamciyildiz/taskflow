-- Actiproc additive, NON-destructive follow-up to APPLIED 20261108120000 migration.
-- Requires existing creem_plan_changes, creem_seat_changes, and plan-limit triggers.
-- Apply in Production ONLY after CI and staging validation, before deploying RPC callers.
-- No existing organization, member, invitation, process or workspace row is changed.
BEGIN;

-- One authoritative database-side interpretation of effective paid capacity.
-- Service-role backend continues to own authentication; this is NOT a public API.
CREATE OR REPLACE FUNCTION public.actiproc_effective_plan_seats(
  p_org public.organizations
) RETURNS TABLE(effective_plan text, seat_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_plan text := 'free';
  v_seats integer := 2;
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
    WHEN 'free' THEN 2
    WHEN 'individual' THEN 1
    WHEN 'pro' THEN GREATEST(1, COALESCE(p_org.seat_limit, 1))
    WHEN 'team' THEN
      CASE WHEN p_org.creem_subscription_id IS NULL
                 AND p_org.ls_subscription_id IS NULL
           THEN NULL -- Preserve existing manual/developer Team unlimited seats.
           ELSE GREATEST(1, COALESCE(p_org.seat_limit, 1)) END
    ELSE 2
  END;

  -- A pending paid seat increase does not provision newly purchased seats yet.
  IF p_org.billing_provider = 'creem'
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

-- Upgrade the ALREADY-INSTALLED project/team triggers in place. No drop/recreate.
CREATE OR REPLACE FUNCTION public.actiproc_enforce_entity_plan_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_plan text;
  v_capacity integer;
  v_count bigint;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('projects', 'teams')
     OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ACTIPROC_PLAN_GUARD_CONTEXT' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'ACTIPROC_ORG_REQUIRED' USING ERRCODE = '23503';
  END IF;

  -- Lock serializes concurrent creates and matching Creem plan mutations.
  SELECT * INTO v_org FROM public.organizations
  WHERE id = NEW.organization_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIPROC_ORG_INVALID' USING ERRCODE = '23503';
  END IF;

  SELECT ep.effective_plan INTO v_plan
  FROM public.actiproc_effective_plan_seats(v_org) ep;

  IF TG_TABLE_NAME = 'projects' THEN
    v_capacity := CASE v_plan
      WHEN 'free' THEN 1 WHEN 'individual' THEN 3
      WHEN 'pro' THEN 10 ELSE NULL END;
    IF v_capacity IS NULL THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO v_count FROM public.projects
    WHERE organization_id = NEW.organization_id;
  ELSE
    v_capacity := CASE v_plan
      WHEN 'free' THEN 1 WHEN 'individual' THEN 1
      WHEN 'pro' THEN 3 ELSE NULL END;
    IF v_capacity IS NULL THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO v_count FROM public.teams
    WHERE organization_id = NEW.organization_id;
  END IF;

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'ACTIPROC_PLAN_LIMIT: % limit of % reached',
      TG_TABLE_NAME, v_capacity USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.actiproc_enforce_entity_plan_limit()
  FROM PUBLIC, anon, authenticated;

-- Replace Creem-only membership guard: use the same effective-plan policy
-- for Free, Individual, Pro and Team. Existing members are never deleted.
-- A second-team membership for an already counted user consumes no extra seat.
CREATE OR REPLACE FUNCTION public.guard_creem_team_member_seat()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_org_id uuid;
  v_user_org uuid;
  v_org public.organizations%ROWTYPE;
  v_seat_limit integer;
  v_used integer;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.teams WHERE id = NEW.team_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ACTIPROC_TEAM_INVALID' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_org_id
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIPROC_ORG_INVALID' USING ERRCODE = '23514';
  END IF;
  SELECT organization_id INTO v_user_org FROM public.users WHERE id = NEW.user_id;
  IF v_user_org IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'ACTIPROC_MEMBER_ORG_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE t.organization_id = v_org_id AND tm.user_id = NEW.user_id
  ) THEN RETURN NEW; END IF;

  SELECT ep.seat_limit INTO v_seat_limit
  FROM public.actiproc_effective_plan_seats(v_org) ep;
  IF v_seat_limit IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(DISTINCT tm.user_id)::integer INTO v_used
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE t.organization_id = v_org_id;
  IF v_used >= v_seat_limit THEN
    RAISE EXCEPTION 'ACTIPROC_SEAT_LIMIT' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_creem_team_member_seat()
  FROM PUBLIC, anon, authenticated;
-- The original trg_guard_creem_team_member_seat trigger remains attached.

-- The service-role-only RPC provides a SINGLE transaction for invitation
-- validation, seat enforcement, user assignment, team membership and acceptance.
-- Replaying the same token or concurrently accepting at capacity cannot create
-- partial user records or silently consume additional seats.
CREATE OR REPLACE FUNCTION public.accept_actiproc_invitation(
  p_token text,
  p_email text,
  p_name text,
  p_avatar_url text DEFAULT NULL,
  p_password_hash text DEFAULT NULL
) RETURNS TABLE(user_id uuid, organization_id uuid, already_member boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_email text := LOWER(BTRIM(p_email));
  v_team_id uuid;
  v_seat_limit integer;
  v_used integer;
  v_counted boolean := FALSE;
  v_existing_member boolean := FALSE;
BEGIN
  IF p_token IS NULL OR LENGTH(BTRIM(p_token)) < 4
    OR v_email IS NULL OR LENGTH(v_email) > 255
    OR POSITION('@' IN v_email) <= 1 THEN
    RAISE EXCEPTION 'ACTIPROC_INVITE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_password_hash IS NOT NULL AND
     (LENGTH(p_password_hash) <> 60
      OR p_password_hash !~ '^\$2[aby]\$[0-9]{2}\$') THEN
    RAISE EXCEPTION 'ACTIPROC_PASSWORD_HASH_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_inv FROM public.invitations
  WHERE token = UPPER(BTRIM(p_token)) FOR UPDATE;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL
     OR v_inv.expires_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'ACTIPROC_INVITE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF LOWER(BTRIM(v_inv.email)) IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'ACTIPROC_INVITE_EMAIL_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_org FROM public.organizations
  WHERE id = v_inv.organization_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIPROC_ORG_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.team_id IS NOT NULL THEN
    SELECT t.id INTO v_team_id FROM public.teams t
    WHERE t.id = v_inv.team_id AND t.organization_id = v_org.id;
  ELSE
    SELECT t.id INTO v_team_id FROM public.teams t
    WHERE t.organization_id = v_org.id ORDER BY t.created_at, t.id LIMIT 1;
  END IF;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'ACTIPROC_INVITE_TEAM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user FROM public.users u
  WHERE LOWER(BTRIM(u.email)) = v_email
  ORDER BY u.created_at, u.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_user.organization_id IS NOT NULL AND v_user.organization_id <> v_org.id THEN
      RAISE EXCEPTION 'ACTIPROC_USER_OTHER_ORG' USING ERRCODE = 'P0001';
    END IF;
    v_existing_member := v_user.organization_id = v_org.id;
    SELECT EXISTS (
      SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = v_user.id AND t.organization_id = v_org.id
    ) INTO v_counted;
  END IF;

  SELECT ep.seat_limit INTO v_seat_limit
  FROM public.actiproc_effective_plan_seats(v_org) ep;
  IF NOT v_counted AND v_seat_limit IS NOT NULL THEN
    SELECT COUNT(DISTINCT tm.user_id)::integer INTO v_used
    FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
    WHERE t.organization_id = v_org.id;
    IF v_used >= v_seat_limit THEN
      RAISE EXCEPTION 'ACTIPROC_SEAT_LIMIT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_user.id IS NULL THEN
    INSERT INTO public.users(email, name, avatar_url, organization_id, role, password_hash)
    VALUES (
      v_email,
      COALESCE(NULLIF(BTRIM(p_name), ''), SPLIT_PART(v_email, '@', 1)),
      p_avatar_url, v_org.id,
      CASE WHEN v_inv.role::text = 'admin' THEN 'admin'::public.user_role
           ELSE 'member'::public.user_role END,
      p_password_hash
    ) RETURNING * INTO v_user;
  ELSIF v_user.organization_id IS NULL THEN
    UPDATE public.users
    SET organization_id = v_org.id,
        role = CASE WHEN v_inv.role::text = 'admin' THEN 'admin'::public.user_role
                    ELSE 'member'::public.user_role END
    WHERE id = v_user.id RETURNING * INTO v_user;
  END IF;

  INSERT INTO public.team_members(team_id, user_id, role)
  VALUES (v_team_id, v_user.id,
    CASE v_inv.role::text
      WHEN 'admin' THEN 'admin'::public.team_role
      WHEN 'viewer' THEN 'viewer'::public.team_role
      ELSE 'member'::public.team_role END)
  ON CONFLICT (team_id, user_id) DO NOTHING;

  UPDATE public.invitations SET accepted_at = CURRENT_TIMESTAMP
  WHERE id = v_inv.id AND accepted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIPROC_INVITE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT v_user.id, v_org.id, v_existing_member;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_actiproc_invitation(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_actiproc_invitation(text,text,text,text,text)
  TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
