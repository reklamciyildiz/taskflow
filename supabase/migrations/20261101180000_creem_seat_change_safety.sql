-- Actiproc / Creem: single-flight seat changes and audit trail.
-- Additive: no existing subscription, seat count, or plan is updated here.
CREATE TABLE IF NOT EXISTS public.creem_seat_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  previous_seats INTEGER NOT NULL CHECK (previous_seats BETWEEN 1 AND 500),
  desired_seats INTEGER NOT NULL CHECK (desired_seats BETWEEN 1 AND 500),
  test_mode BOOLEAN NOT NULL,
  previous_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awaiting_sync','review','confirmed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_creem_seat_changes_open
  ON public.creem_seat_changes(organization_id)
  WHERE status IN ('pending','awaiting_sync','review');
CREATE INDEX IF NOT EXISTS idx_creem_seat_changes_org_created
  ON public.creem_seat_changes(organization_id,created_at DESC);
ALTER TABLE public.creem_seat_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creem_seat_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.creem_seat_changes TO service_role;

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
    current_org.plan_name NOT IN ('pro','team') OR
    current_org.subscription_status IS DISTINCT FROM 'active' OR
    current_org.creem_payment_hold IS DISTINCT FROM FALSE OR
    current_org.creem_subscription_id IS DISTINCT FROM p_subscription OR
    current_org.creem_test_mode IS DISTINCT FROM p_test OR
    current_org.seat_limit IS DISTINCT FROM p_previous
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
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creem_seat_change(UUID,TEXT,INTEGER,INTEGER,BOOLEAN)
 TO service_role;

CREATE OR REPLACE FUNCTION public.transition_creem_seat_change(
 p_id UUID,p_from TEXT,p_to TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER;
BEGIN
 IF p_from NOT IN ('pending','awaiting_sync','review') OR
    p_to NOT IN ('awaiting_sync','review','failed') OR
    (p_from='pending' AND p_to NOT IN ('awaiting_sync','review','failed')) OR
    (p_from='awaiting_sync' AND p_to NOT IN ('review','failed')) OR
    (p_from='review' AND p_to<>'failed')
 THEN RETURN FALSE; END IF;
 UPDATE public.creem_seat_changes SET status=p_to,updated_at=now()
 WHERE id=p_id AND status=p_from;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.transition_creem_seat_change(UUID,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_creem_seat_change(UUID,TEXT,TEXT)
 TO service_role;

-- Only signed, mapped Creem subscription events can settle a pending operation.
-- A paid confirmation is required when increasing seats; a verified update
-- is enough for a seat decrease (Creem may take effect immediately).
CREATE OR REPLACE FUNCTION public.confirm_creem_seat_change(
 p_org UUID,p_subscription TEXT,p_current_units INTEGER,p_event TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER;
BEGIN
 IF p_event NOT IN ('subscription.paid','subscription.update') THEN RETURN FALSE; END IF;
 UPDATE public.creem_seat_changes sc
 SET status='confirmed',updated_at=now()
 WHERE sc.organization_id=p_org AND sc.subscription_id=p_subscription
   AND sc.desired_seats=p_current_units
   AND sc.status IN ('pending','awaiting_sync','review')
   AND (p_event='subscription.paid' OR sc.desired_seats<sc.previous_seats)
   AND EXISTS (
     SELECT 1 FROM public.organizations org WHERE org.id=p_org
       AND org.creem_subscription_id=p_subscription
       AND org.seat_limit=p_current_units
       AND org.subscription_status='active'
       AND org.creem_payment_hold IS FALSE
   );
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.confirm_creem_seat_change(UUID,TEXT,INTEGER,TEXT)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_creem_seat_change(UUID,TEXT,INTEGER,TEXT)
 TO service_role;
