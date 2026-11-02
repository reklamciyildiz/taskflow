-- Actiproc public AI fair-use release: safe, idempotent, transactional
-- 12 chat reservations per 60-second sliding window per user.
-- Replaces the existing RPC in place without deleting counters, reservations,
-- conversations, notes, payments or prior usage. Requires the original AI
-- foundation migration (20261017140000).
-- IMPORTANT: Apply to primary Supabase before switching off beta restrictions.
--
-- Chat burst limit is checked under the same organization/user advisory locks
-- as daily/monthly counters; no separate non-atomic read-then-write race.
CREATE OR REPLACE FUNCTION public.reserve_ai_quota(
  p_request_key uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_feature text,
  p_daily_user_limit integer,
  p_monthly_org_limit integer
)
RETURNS TABLE(
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  reason text,
  reservation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_daily_count integer := 0;
  v_monthly_count integer := 0;
  v_reservation_id uuid;
  v_minute_count integer := 0;
  v_minute_oldest timestamptz;
BEGIN
  IF p_daily_user_limit < 1 OR p_monthly_org_limit < 1
     OR p_daily_user_limit > 1000000 OR p_monthly_org_limit > 100000000 THEN
    RAISE EXCEPTION 'Invalid AI quota limits';
  END IF;
  IF length(btrim(p_feature)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid AI feature';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'AI quota scope mismatch';
  END IF;

  -- Fixed lock order prevents concurrent requests from oversubscribing either
  -- organization or user quota, and avoids cross-scope deadlocks.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-quota:org:' || p_organization_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-quota:user:' || p_user_id::text, 0));

  SELECT id INTO v_reservation_id
  FROM public.ai_quota_reservations
  WHERE request_key = p_request_key
    AND user_id = p_user_id
    AND organization_id = p_organization_id;
  IF v_reservation_id IS NOT NULL THEN
    SELECT request_count INTO v_daily_count FROM public.ai_quota_counters
      WHERE scope_type = 'user_day' AND scope_id = p_user_id AND bucket_start = v_day;
    SELECT request_count INTO v_monthly_count FROM public.ai_quota_counters
      WHERE scope_type = 'organization_month' AND scope_id = p_organization_id AND bucket_start = v_month;
    RETURN QUERY SELECT true,
      greatest(0, least(p_daily_user_limit - coalesce(v_daily_count, 0),
                        p_monthly_org_limit - coalesce(v_monthly_count, 0))),
      ((v_day + 1)::timestamp AT TIME ZONE 'UTC'), NULL::text, v_reservation_id;
    RETURN;
  END IF;

  SELECT request_count INTO v_daily_count FROM public.ai_quota_counters
    WHERE scope_type = 'user_day' AND scope_id = p_user_id AND bucket_start = v_day;
  SELECT request_count INTO v_monthly_count FROM public.ai_quota_counters
    WHERE scope_type = 'organization_month' AND scope_id = p_organization_id AND bucket_start = v_month;
  v_daily_count := coalesce(v_daily_count, 0);
  v_monthly_count := coalesce(v_monthly_count, 0);

  IF v_daily_count >= p_daily_user_limit THEN
    RETURN QUERY SELECT false, 0, ((v_day + 1)::timestamp AT TIME ZONE 'UTC'),
      'Daily AI request limit exceeded'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_monthly_count >= p_monthly_org_limit THEN
    RETURN QUERY SELECT false, 0, (((v_month + interval '1 month')::timestamp) AT TIME ZONE 'UTC'),
      'Monthly organization AI request limit exceeded'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Sliding, per-user, one-minute burst cap. Uses the SAME org/user advisory
  -- locks as quota reservation: concurrent calls cannot both bypass the gate.
  -- Existing reservations are indexed by user_id, created_at DESC. Refunded
  -- attempts disappear when release_ai_quota_reservation deletes them.
  -- Only chat is affected; existing unrelated AI feature quotas are unchanged.
  IF p_feature = 'axiom-chat' THEN
    SELECT count(*)::integer, min(created_at)
      INTO v_minute_count, v_minute_oldest
    FROM public.ai_quota_reservations
    WHERE user_id = p_user_id AND feature = 'axiom-chat'
      AND created_at > now() - interval '60 seconds';
    IF v_minute_count >= 12 THEN
      RETURN QUERY SELECT false, 0,
        coalesce(v_minute_oldest + interval '60 seconds', now() + interval '60 seconds'),
        'Minute AI request rate limit exceeded'::text, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.ai_quota_counters(scope_type, scope_id, bucket_start, request_count)
  VALUES ('user_day', p_user_id, v_day, 1)
  ON CONFLICT (scope_type, scope_id, bucket_start)
  DO UPDATE SET request_count = ai_quota_counters.request_count + 1, updated_at = now();

  INSERT INTO public.ai_quota_counters(scope_type, scope_id, bucket_start, request_count)
  VALUES ('organization_month', p_organization_id, v_month, 1)
  ON CONFLICT (scope_type, scope_id, bucket_start)
  DO UPDATE SET request_count = ai_quota_counters.request_count + 1, updated_at = now();

  INSERT INTO public.ai_quota_reservations(request_key, organization_id, user_id, feature)
  VALUES (p_request_key, p_organization_id, p_user_id, btrim(p_feature))
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT true,
    greatest(0, least(p_daily_user_limit - v_daily_count - 1,
                      p_monthly_org_limit - v_monthly_count - 1)),
    ((v_day + 1)::timestamp AT TIME ZONE 'UTC'), NULL::text, v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_quota(uuid,uuid,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(uuid,uuid,uuid,text,integer,integer)
  TO service_role;

-- Public-rollout readiness probe. It is deployed in the same migration as
-- the hardened RPC, so a missing migration blocks AI outside beta safely.
CREATE OR REPLACE FUNCTION public.ai_public_burst_guard_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT true $$;

REVOKE ALL ON FUNCTION public.ai_public_burst_guard_ready()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_public_burst_guard_ready()
  TO service_role;
