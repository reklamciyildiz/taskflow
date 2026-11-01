-- Actiproc Creem re-subscription. Requires the base Creem migration.
-- Prepared for manual review/application on the PRIMARY Supabase project.
-- NO existing organizations/subscriptions are changed by executing this migration.
ALTER TABLE public.creem_checkout_intents
  ADD COLUMN IF NOT EXISTS previous_subscription_id TEXT;

CREATE TABLE IF NOT EXISTS public.creem_subscription_history (
  subscription_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  superseded_by_subscription_id TEXT NOT NULL,
  superseded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creem_subscription_history_org
  ON public.creem_subscription_history(organization_id,superseded_at DESC);
ALTER TABLE public.creem_subscription_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creem_subscription_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.creem_subscription_history TO service_role;

-- Lock the organization: only one outstanding renewal checkout may exist.
CREATE OR REPLACE FUNCTION public.reserve_creem_resubscription(
 p_org UUID, p_request UUID, p_previous TEXT, p_plan TEXT, p_seats INTEGER, p_test BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_org public.organizations%ROWTYPE;
BEGIN
 SELECT * INTO current_org FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND OR p_request IS NULL OR COALESCE(p_previous,'')=''
   OR p_plan NOT IN ('individual','pro','team')
   OR p_seats NOT BETWEEN 1 AND 500
   OR (p_plan='individual' AND p_seats<>1)
   OR p_test IS NULL
   OR current_org.billing_provider IS DISTINCT FROM 'creem'
   OR current_org.creem_subscription_id IS DISTINCT FROM p_previous
   OR current_org.creem_test_mode IS DISTINCT FROM p_test
   OR current_org.creem_payment_hold IS DISTINCT FROM FALSE
   OR current_org.ls_subscription_id IS NOT NULL
   OR current_org.subscription_status NOT IN ('cancelled','expired')
 THEN RETURN FALSE; END IF;
 IF EXISTS (SELECT 1 FROM public.creem_checkout_intents
   WHERE organization_id=p_org AND fulfilled_at IS NULL
     AND created_at > NOW()-INTERVAL '24 hours') THEN RETURN FALSE; END IF;
 INSERT INTO public.creem_checkout_intents(
  request_id,organization_id,plan_name,units,test_mode,previous_subscription_id)
 VALUES(p_request,p_org,p_plan,p_seats,p_test,p_previous);
 RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.reserve_creem_resubscription(UUID,UUID,TEXT,TEXT,INTEGER,BOOLEAN)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creem_resubscription(UUID,UUID,TEXT,TEXT,INTEGER,BOOLEAN)
 TO service_role;

-- Atomically replace a verified terminal subscription only for an authorized
-- fulfilled Creem checkout. Preserves an immutable history mapping for late events.
CREATE OR REPLACE FUNCTION public.apply_creem_resubscription(
 p_request UUID, p_org UUID, p_previous TEXT, p_new TEXT,
 p_customer TEXT, p_product TEXT, p_plan TEXT, p_status TEXT,
 p_seats INTEGER, p_end TIMESTAMPTZ, p_test BOOLEAN, p_updated TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_org public.organizations%ROWTYPE;
        ci public.creem_checkout_intents%ROWTYPE;
BEGIN
 SELECT * INTO old_org FROM public.organizations WHERE id=p_org FOR UPDATE;
 SELECT * INTO ci FROM public.creem_checkout_intents WHERE request_id=p_request FOR UPDATE;
 IF NOT FOUND OR ci.organization_id IS DISTINCT FROM p_org
   OR ci.previous_subscription_id IS DISTINCT FROM p_previous
   OR ci.fulfilled_at IS NOT NULL OR ci.checkout_id IS NULL
   OR ci.plan_name IS DISTINCT FROM p_plan OR ci.units IS DISTINCT FROM p_seats
   OR ci.test_mode IS DISTINCT FROM p_test
   OR old_org.creem_subscription_id IS DISTINCT FROM p_previous
   OR old_org.billing_provider IS DISTINCT FROM 'creem'
   OR old_org.creem_customer_id IS DISTINCT FROM p_customer
   OR old_org.creem_test_mode IS DISTINCT FROM p_test
   OR old_org.creem_payment_hold IS DISTINCT FROM FALSE
   OR old_org.ls_subscription_id IS NOT NULL
   OR old_org.subscription_status NOT IN ('cancelled','expired')
   OR p_new IS NULL OR p_new=p_previous
   OR p_status NOT IN ('active','trialing')
   OR p_updated IS NULL OR p_end IS NULL OR p_end<=NOW()
   OR p_plan NOT IN ('individual','pro','team')
   OR p_seats NOT BETWEEN 1 AND 500
   OR (p_plan='individual' AND p_seats<>1)
 THEN RETURN FALSE; END IF;
 INSERT INTO public.creem_subscription_history(
  subscription_id,organization_id,superseded_by_subscription_id)
 VALUES(p_previous,p_org,p_new);
 UPDATE public.organizations
 SET creem_subscription_id=p_new,creem_product_id=p_product,
     creem_subscription_updated_at=p_updated,plan_name=p_plan,
     subscription_status=p_status,seat_limit=p_seats,
     subscription_ends_at=p_end
 WHERE id=p_org;
 UPDATE public.creem_checkout_intents SET fulfilled_at=NOW()
 WHERE request_id=p_request;
 RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END $$;
REVOKE ALL ON FUNCTION public.apply_creem_resubscription(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TIMESTAMPTZ,BOOLEAN,TIMESTAMPTZ)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_creem_resubscription(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TIMESTAMPTZ,BOOLEAN,TIMESTAMPTZ)
 TO service_role;
