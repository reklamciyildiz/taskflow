-- Atomic, server-only rolling token admission for shared provider/model quotas.
-- No prompts, responses, credentials, or source content are stored.
CREATE TABLE IF NOT EXISTS public.ai_provider_token_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_-]{1,40}$'),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  reserved_tokens integer NOT NULL CHECK (reserved_tokens BETWEEN 1 AND 1000000),
  actual_tokens integer CHECK (actual_tokens BETWEEN 0 AND 1000000),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_provider_token_reservations_window_idx
  ON public.ai_provider_token_reservations(provider,model,created_at DESC);

CREATE OR REPLACE FUNCTION public.reserve_ai_provider_tokens(
  p_request_key uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_provider text,
  p_model text,
  p_requested_tokens integer,
  p_token_limit integer
)
RETURNS TABLE(allowed boolean,reservation_id uuid,remaining_tokens integer,retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_used integer := 0;
  v_id uuid;
  v_oldest timestamptz;
BEGIN
  IF p_requested_tokens<1 OR p_token_limit<1 OR p_requested_tokens>p_token_limit OR p_token_limit>1000000 THEN
    RAISE EXCEPTION 'Invalid provider token admission limits';
  END IF;
  IF p_provider !~ '^[a-z0-9_-]{1,40}$' OR length(p_model) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid provider token admission scope';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id AND organization_id=p_organization_id) THEN
    RAISE EXCEPTION 'Provider token admission scope mismatch';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai-provider-tokens:'||p_provider||':'||p_model,0));
  SELECT id INTO v_id FROM public.ai_provider_token_reservations
    WHERE request_key=p_request_key AND user_id=p_user_id AND organization_id=p_organization_id;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT true,v_id,p_token_limit,0;
    RETURN;
  END IF;

  SELECT coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0)::integer,min(created_at)
    INTO v_used,v_oldest
  FROM public.ai_provider_token_reservations
  WHERE provider=p_provider AND model=p_model AND created_at>now()-interval '60 seconds';

  IF v_used+p_requested_tokens>p_token_limit THEN
    RETURN QUERY SELECT false,NULL::uuid,greatest(0,p_token_limit-v_used),
      greatest(1,ceil(extract(epoch FROM ((v_oldest+interval '60 seconds')-now())))::integer);
    RETURN;
  END IF;

  INSERT INTO public.ai_provider_token_reservations(
    request_key,organization_id,user_id,provider,model,reserved_tokens
  ) VALUES(p_request_key,p_organization_id,p_user_id,p_provider,p_model,p_requested_tokens)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT true,v_id,p_token_limit-v_used-p_requested_tokens,0;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ai_provider_tokens(
  p_reservation_id uuid,p_user_id uuid,p_status text,p_actual_tokens integer DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status NOT IN ('completed','failed','cancelled') OR p_actual_tokens<0 THEN
    RAISE EXCEPTION 'Invalid provider token finalization';
  END IF;
  UPDATE public.ai_provider_token_reservations SET
    status=p_status,
    actual_tokens=CASE WHEN p_status='completed' AND p_actual_tokens IS NOT NULL THEN p_actual_tokens ELSE actual_tokens END,
    finalized_at=now()
  WHERE id=p_reservation_id AND user_id=p_user_id AND status='reserved';
END;
$$;

-- Groq rejects (notably 429 before inference) are not successful billable
-- attempts. Release the daily/monthly request reservation atomically so a
-- provider throttle cannot consume the user's Axiom quota.
CREATE OR REPLACE FUNCTION public.release_ai_quota_reservation(
  p_request_key uuid,p_user_id uuid,p_organization_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_created_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-quota:org:'||p_organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-quota:user:'||p_user_id::text,0));
  DELETE FROM public.ai_quota_reservations
    WHERE request_key=p_request_key AND user_id=p_user_id AND organization_id=p_organization_id
    RETURNING created_at INTO v_created_at;
  IF v_created_at IS NULL THEN RETURN false; END IF;
  UPDATE public.ai_quota_counters SET request_count=greatest(0,request_count-1),updated_at=now()
    WHERE scope_type='user_day' AND scope_id=p_user_id
      AND bucket_start=(v_created_at AT TIME ZONE 'UTC')::date;
  UPDATE public.ai_quota_counters SET request_count=greatest(0,request_count-1),updated_at=now()
    WHERE scope_type='organization_month' AND scope_id=p_organization_id
      AND bucket_start=date_trunc('month',v_created_at AT TIME ZONE 'UTC')::date;
  RETURN true;
END;
$$;

ALTER TABLE public.ai_provider_token_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_token_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_provider_token_reservations TO service_role;
REVOKE ALL ON FUNCTION public.reserve_ai_provider_tokens(uuid,uuid,uuid,text,text,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_ai_provider_tokens(uuid,uuid,text,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_ai_quota_reservation(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_provider_tokens(uuid,uuid,uuid,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ai_provider_tokens(uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_quota_reservation(uuid,uuid,uuid) TO service_role;

COMMENT ON TABLE public.ai_provider_token_reservations IS
  'Rolling provider token admission metadata; never stores prompts, responses, sources, or credentials.';
