-- Additive amendment after 20261101170000_creem_safe_resubscription.sql.
-- Expand VERIFIED terminal re-subscriptions to annually paid Individual 1..500 seats.
-- No row deletions, subscription resets, checkout unlocks or plan changes.
-- Live/Test mismatch, provider identity and explicit payment consent remain
-- enforced by the application's checkout and webhook settlement.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.reserve_creem_resubscription(uuid,uuid,text,text,integer,boolean)') IS NULL
   OR to_regprocedure('public.apply_creem_resubscription(uuid,uuid,text,text,text,text,text,text,integer,timestamp with time zone,boolean,timestamp with time zone)') IS NULL
   OR to_regclass('public.creem_subscription_history') IS NULL
 THEN
   RAISE EXCEPTION 'ACTIPROC_RESUBSCRIPTION_SCHEMA_NOT_READY';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.reserve_creem_resubscription(
 p_org UUID, p_request UUID, p_previous TEXT, p_plan TEXT, p_seats INTEGER, p_test BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_org public.organizations%ROWTYPE;
BEGIN
 SELECT * INTO current_org FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND OR p_request IS NULL OR COALESCE(p_previous,'')=''
   OR p_plan NOT IN ('individual','pro','team')
   OR p_seats NOT BETWEEN 1 AND 500
   OR p_test IS NULL
   OR current_org.billing_provider IS DISTINCT FROM 'creem'
   OR current_org.creem_subscription_id IS DISTINCT FROM p_previous
   OR current_org.creem_test_mode IS DISTINCT FROM p_test
   OR current_org.creem_payment_hold IS DISTINCT FROM FALSE
   OR current_org.ls_subscription_id IS NOT NULL
   OR current_org.subscription_status NOT IN ('cancelled','expired')
 THEN RETURN FALSE; END IF;
 IF EXISTS (SELECT 1 FROM public.creem_checkout_intents
   WHERE organization_id=p_org AND fulfilled_at IS NULL) THEN RETURN FALSE; END IF;
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

COMMIT;
NOTIFY pgrst, 'reload schema';
