-- Apply after 20261101180000_creem_seat_change_safety.sql.
-- Additive, fail-closed: no customer charges or subscription changes from this DDL.
CREATE TABLE IF NOT EXISTS public.creem_plan_changes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 previous_plan TEXT NOT NULL CHECK (previous_plan IN ('individual','pro')),
 desired_plan TEXT NOT NULL CHECK (desired_plan IN ('pro','team')),
 previous_product_id TEXT NOT NULL,
 desired_product_id TEXT NOT NULL,
 previous_transaction_id TEXT NOT NULL CHECK (previous_transaction_id ~ '^tran_[A-Za-z0-9_-]+$'),
 previous_seats INTEGER NOT NULL CHECK (previous_seats BETWEEN 1 AND 500),
 test_mode BOOLEAN NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK
  (status IN ('pending','awaiting_sync','review','confirmed','failed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (previous_plan<>desired_plan),
 CHECK (previous_plan='individual' OR desired_plan='team')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_creem_plan_changes_open
 ON public.creem_plan_changes (organization_id)
 WHERE status IN ('pending','awaiting_sync','review');
CREATE INDEX IF NOT EXISTS idx_creem_plan_changes_org_created
 ON public.creem_plan_changes (organization_id,created_at DESC);
ALTER TABLE public.creem_plan_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creem_plan_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.creem_plan_changes TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_creem_plan_change(
 p_org UUID,p_subscription TEXT,p_previous TEXT,p_desired TEXT,
 p_previous_product TEXT,p_desired_product TEXT,p_previous_transaction TEXT,
 p_seats INTEGER,p_customer TEXT,p_test BOOLEAN
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org public.organizations%ROWTYPE;
DECLARE token UUID;
BEGIN
 SELECT * INTO org FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND OR p_test IS NULL OR
    p_previous NOT IN ('individual','pro') OR
    p_desired NOT IN ('pro','team') OR
    NOT ((p_previous='individual' AND p_desired IN ('pro','team')) OR
         (p_previous='pro' AND p_desired='team')) OR
    p_previous_transaction IS NULL OR p_previous_transaction !~ '^tran_[A-Za-z0-9_-]+$' OR
    p_seats IS NULL OR p_seats NOT BETWEEN 1 AND 500 OR
    org.billing_provider IS DISTINCT FROM 'creem' OR
    org.ls_subscription_id IS NOT NULL OR
    org.subscription_status IS DISTINCT FROM 'active' OR
    org.creem_payment_hold IS DISTINCT FROM FALSE OR
    org.creem_subscription_id IS DISTINCT FROM p_subscription OR
    org.creem_customer_id IS DISTINCT FROM p_customer OR
    org.creem_product_id IS DISTINCT FROM p_previous_product OR
    org.creem_test_mode IS DISTINCT FROM p_test OR
    org.plan_name IS DISTINCT FROM p_previous OR
    org.seat_limit IS DISTINCT FROM p_seats
 THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.creem_seat_changes
   WHERE organization_id=p_org AND status IN ('pending','awaiting_sync','review'))
 OR EXISTS (SELECT 1 FROM public.creem_plan_changes
   WHERE organization_id=p_org AND status IN ('pending','awaiting_sync','review'))
 THEN RETURN NULL; END IF;
 INSERT INTO public.creem_plan_changes (
  organization_id,subscription_id,customer_id,previous_plan,desired_plan,
  previous_product_id,desired_product_id,previous_transaction_id,previous_seats,test_mode
 ) VALUES (
  p_org,p_subscription,p_customer,p_previous,p_desired,p_previous_product,
  p_desired_product,p_previous_transaction,p_seats,p_test
 ) RETURNING id INTO token;
 RETURN token;
EXCEPTION WHEN unique_violation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.reserve_creem_plan_change(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,BOOLEAN)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creem_plan_change(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,BOOLEAN)
 TO service_role;

CREATE OR REPLACE FUNCTION public.transition_creem_plan_change(
 p_id UUID,p_from TEXT,p_to TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER;
BEGIN
 IF p_from NOT IN ('pending','awaiting_sync','review') OR
    p_to NOT IN ('awaiting_sync','review','failed') OR
    (p_from='review' AND p_to<>'failed') OR
    (p_from='awaiting_sync' AND p_to NOT IN ('review','failed'))
 THEN RETURN FALSE; END IF;
 UPDATE public.creem_plan_changes SET status=p_to,updated_at=now()
 WHERE id=p_id AND status=p_from;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.transition_creem_plan_change(UUID,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_creem_plan_change(UUID,TEXT,TEXT)
 TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_creem_plan_change(
 p_org UUID,p_subscription TEXT,p_plan TEXT,p_product TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER;
BEGIN
 UPDATE public.creem_plan_changes ch
 SET status='confirmed',updated_at=now()
 WHERE ch.organization_id=p_org AND ch.subscription_id=p_subscription
   AND ch.desired_plan=p_plan AND ch.desired_product_id=p_product
   AND ch.status IN ('pending','awaiting_sync','review')
   AND EXISTS (
    SELECT 1 FROM public.organizations org
    WHERE org.id=p_org AND org.creem_subscription_id=p_subscription
     AND org.plan_name=p_plan AND org.creem_product_id=p_product
     AND org.subscription_status='active' AND org.creem_payment_hold IS FALSE
   );
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.confirm_creem_plan_change(UUID,TEXT,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_creem_plan_change(UUID,TEXT,TEXT,TEXT)
 TO service_role;

-- Share the same locked org row; seat increases cannot race against plan upgrades.
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
