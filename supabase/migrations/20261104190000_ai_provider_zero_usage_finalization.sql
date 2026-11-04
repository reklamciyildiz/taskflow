-- Actiproc AI provider accounting correction. This migration is NOT applied by
-- a GitHub commit: run in staging, validate, then apply to production explicitly.
--
-- Failures known to consume zero tokens (e.g. upstream HTTP 429 before any
-- inference) must not occupy the shared provider's rolling 60-second budget.
-- Timeouts/unknown usage continue to hold their original estimate: never
-- assume an interrupted stream was free.
CREATE OR REPLACE FUNCTION public.finalize_ai_provider_tokens(
  p_reservation_id uuid,
  p_user_id uuid,
  p_status text,
  p_actual_tokens integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF p_status IS NULL
    OR p_status NOT IN ('completed','failed','cancelled')
    OR p_actual_tokens < 0
    OR p_actual_tokens > 1000000
  THEN
    RAISE EXCEPTION 'Invalid provider token finalization';
  END IF;

  UPDATE public.ai_provider_token_reservations
  SET
    status=p_status,
    -- NULL means unknown usage and deliberately leaves the estimate reserved.
    -- 0 is an explicit, known pre-inference failure, not a guess.
    actual_tokens=CASE
      WHEN p_actual_tokens IS NOT NULL THEN p_actual_tokens
      ELSE actual_tokens
    END,
    finalized_at=now()
  WHERE id=p_reservation_id
    AND user_id=p_user_id
    AND status='reserved';
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_ai_provider_tokens(uuid,uuid,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_provider_tokens(uuid,uuid,text,integer)
  TO service_role;
