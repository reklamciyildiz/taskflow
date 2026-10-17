-- Foundation AI Phase 0: private cache access + atomic quota reservations.
-- Prerequisite: 20260117000000_ai_features.sql.

-- ai_cache is an internal derived store. Browser JWT roles must never read cached
-- prompts/responses, even when a future feature accidentally stores tenant data.
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view AI cache" ON public.ai_cache;
REVOKE ALL ON public.ai_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_cache TO service_role;

REVOKE ALL ON FUNCTION public.increment_cache_hit(varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clean_expired_ai_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cache_hit(varchar) TO service_role;
GRANT EXECUTE ON FUNCTION public.clean_expired_ai_cache() TO service_role;

CREATE TABLE public.ai_quota_counters (
  scope_type text NOT NULL CHECK (scope_type IN ('user_day', 'organization_month')),
  scope_id uuid NOT NULL,
  bucket_start date NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id, bucket_start)
);

CREATE TABLE public.ai_quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (length(feature) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_quota_reservations_org_created_idx
  ON public.ai_quota_reservations(organization_id, created_at DESC);
CREATE INDEX ai_quota_reservations_user_created_idx
  ON public.ai_quota_reservations(user_id, created_at DESC);

-- Preserve current-period usage when enabling the new counter after deployment.
INSERT INTO public.ai_quota_counters(scope_type, scope_id, bucket_start, request_count)
SELECT 'user_day', user_id, (now() AT TIME ZONE 'UTC')::date, count(*)::integer
FROM public.ai_requests
WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
GROUP BY user_id
ON CONFLICT (scope_type, scope_id, bucket_start)
DO UPDATE SET request_count = EXCLUDED.request_count, updated_at = now();

INSERT INTO public.ai_quota_counters(scope_type, scope_id, bucket_start, request_count)
SELECT 'organization_month', organization_id,
       date_trunc('month', now() AT TIME ZONE 'UTC')::date,
       count(*)::integer
FROM public.ai_requests
WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
GROUP BY organization_id
ON CONFLICT (scope_type, scope_id, bucket_start)
DO UPDATE SET request_count = EXCLUDED.request_count, updated_at = now();

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
SET search_path = public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_daily_count integer := 0;
  v_monthly_count integer := 0;
  v_reservation_id uuid;
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

ALTER TABLE public.ai_quota_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quota_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_quota_counters, public.ai_quota_reservations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_quota_counters, public.ai_quota_reservations TO service_role;
REVOKE ALL ON FUNCTION public.reserve_ai_quota(uuid,uuid,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(uuid,uuid,uuid,text,integer,integer)
  TO service_role;

COMMENT ON TABLE public.ai_quota_reservations IS
  'Idempotent, server-only reservations for billable AI attempts. No prompt or response content is stored.';
