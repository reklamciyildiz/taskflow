-- Model-routing V2: atomic admission across multiple models sharing one provider account.
-- Does not replace or alter the V1 function. Must be applied before enabling
-- AI_PROVIDER_ADMISSION_V2_ENABLED=true. No existing reservations are rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_ai_provider_tokens_v2(
  p_request_key uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_provider text,
  p_model text,
  p_requested_tokens integer,
  p_model_token_limit integer,
  p_provider_token_limit integer,
  p_model_request_limit integer,
  p_provider_request_limit integer
)
RETURNS TABLE (
  allowed boolean,
  reservation_id uuid,
  remaining_tokens integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_existing public.ai_provider_token_reservations%ROWTYPE;
  v_model_tokens bigint;
  v_provider_tokens bigint;
  v_model_requests bigint;
  v_provider_requests bigint;
  v_first_model timestamptz;
  v_first_provider timestamptz;
  v_remaining integer;
  v_retry integer;
  v_id uuid;
BEGIN
  IF p_request_key IS NULL OR p_user_id IS NULL OR p_organization_id IS NULL
    OR p_provider !~ '^[a-z0-9_-]{1,40}$'
    OR length(p_model) NOT BETWEEN 1 AND 160
    OR p_requested_tokens NOT BETWEEN 1 AND 1000000
    OR p_model_token_limit NOT BETWEEN 1 AND 1000000
    OR p_provider_token_limit NOT BETWEEN 1 AND 1000000
    OR p_model_request_limit NOT BETWEEN 1 AND 10000
    OR p_provider_request_limit NOT BETWEEN 1 AND 10000
  THEN
    RAISE EXCEPTION 'Invalid model/provider rate admission configuration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id=p_user_id AND organization_id=p_organization_id
  ) THEN
    RAISE EXCEPTION 'Provider token admission scope mismatch';
  END IF;

  -- All V2 requests for this provider are serialized across models, tenants
  -- and serverless instances. V1 is retained only for opt-out rollback.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('ai-provider-account:'||p_provider,0)
  );

  SELECT * INTO v_existing
  FROM public.ai_provider_token_reservations
  WHERE request_key=p_request_key;
  IF FOUND THEN
    IF v_existing.user_id<>p_user_id
      OR v_existing.organization_id<>p_organization_id
      OR v_existing.provider<>p_provider
      OR v_existing.model<>p_model
    THEN
      RAISE EXCEPTION 'Provider reservation idempotency scope mismatch';
    END IF;
    RETURN QUERY SELECT true,v_existing.id,
      greatest(0,p_model_token_limit-v_existing.reserved_tokens),0;
    RETURN;
  END IF;

  SELECT coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0)::bigint,
    count(*)::bigint,min(created_at)
    INTO v_model_tokens,v_model_requests,v_first_model
  FROM public.ai_provider_token_reservations
  WHERE provider=p_provider AND model=p_model
    AND created_at>now()-interval '60 seconds';

  SELECT coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0)::bigint,
    count(*)::bigint,min(created_at)
    INTO v_provider_tokens,v_provider_requests,v_first_provider
  FROM public.ai_provider_token_reservations
  WHERE provider=p_provider
    AND created_at>now()-interval '60 seconds';

  v_remaining=greatest(0,least(p_model_token_limit-v_model_tokens,
    p_provider_token_limit-v_provider_tokens))::integer;
  IF v_model_tokens+p_requested_tokens>p_model_token_limit
    OR v_provider_tokens+p_requested_tokens>p_provider_token_limit
    OR v_model_requests>=p_model_request_limit
    OR v_provider_requests>=p_provider_request_limit
  THEN
    v_retry=greatest(1,
      ceil(extract(epoch FROM (least(
        coalesce(v_first_model,now()),
        coalesce(v_first_provider,now())
      )+interval '60 seconds'-now())))::integer);
    RETURN QUERY SELECT false,NULL::uuid,v_remaining,v_retry;
    RETURN;
  END IF;

  INSERT INTO public.ai_provider_token_reservations(
    request_key,organization_id,user_id,provider,model,reserved_tokens
  ) VALUES(
    p_request_key,p_organization_id,p_user_id,p_provider,p_model,p_requested_tokens
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT true,v_id,greatest(0,v_remaining-p_requested_tokens),0;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_provider_tokens_v2(
  uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_provider_tokens_v2(
  uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer
) TO service_role;

COMMENT ON FUNCTION public.reserve_ai_provider_tokens_v2(
  uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer
) IS 'Atomic same-provider TPM+RPM and per-model TPM+RPM admission; production opt-in only.';

COMMIT;
