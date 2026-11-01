-- Creem parallel migration. DO NOT apply in production until reviewed and approved.
-- Existing Lemon Squeezy subscriptions and their identifiers are preserved.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_provider TEXT,
  ADD COLUMN IF NOT EXISTS creem_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS creem_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS creem_product_id TEXT,
  ADD COLUMN IF NOT EXISTS creem_test_mode BOOLEAN,
  ADD COLUMN IF NOT EXISTS creem_subscription_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creem_payment_hold BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE public.organizations SET billing_provider='lemon'
 WHERE ls_subscription_id IS NOT NULL AND billing_provider IS NULL;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_name_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_name_check
 CHECK (plan_name IN ('free','individual','pro','team'));
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_billing_provider_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_billing_provider_check
 CHECK (billing_provider IS NULL OR billing_provider IN ('lemon','creem'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_creem_subscription_id
 ON public.organizations(creem_subscription_id) WHERE creem_subscription_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.creem_checkout_intents (
 request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 plan_name TEXT NOT NULL CHECK (plan_name IN ('individual','pro','team')),
 units INTEGER NOT NULL CHECK (units BETWEEN 1 AND 500),
 test_mode BOOLEAN NOT NULL,
 checkout_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 fulfilled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_creem_checkout_intents_org ON public.creem_checkout_intents(organization_id, created_at);
ALTER TABLE public.creem_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creem_checkout_intents FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.creem_webhook_events (
 event_id TEXT PRIMARY KEY,
 payload_hash TEXT NOT NULL,
 event_type TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed','quarantined')),
 attempts INTEGER NOT NULL DEFAULT 1,
 processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_error TEXT,
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ
);
ALTER TABLE public.creem_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creem_webhook_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_creem_event(p_id TEXT, p_hash TEXT, p_type TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.creem_webhook_events%ROWTYPE;
BEGIN
 IF NULLIF(p_id,'') IS NULL THEN RAISE EXCEPTION 'Missing Creem event id'; END IF;
 INSERT INTO public.creem_webhook_events(event_id,payload_hash,event_type)
 VALUES (p_id,p_hash,p_type) ON CONFLICT(event_id) DO NOTHING;
 IF FOUND THEN RETURN TRUE; END IF;
 SELECT * INTO current_row FROM public.creem_webhook_events WHERE event_id=p_id FOR UPDATE;
 IF current_row.payload_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Event id hash mismatch'; END IF;
 IF current_row.status IN ('completed','quarantined') THEN RETURN FALSE; END IF;
 IF current_row.status='processing' AND current_row.processing_started_at > NOW() - INTERVAL '90 seconds' THEN
   RETURN FALSE;
 END IF;
 UPDATE public.creem_webhook_events SET status='processing', attempts=attempts+1,
  processing_started_at=NOW(), last_error=NULL WHERE event_id=p_id;
 RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.claim_creem_event(TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_creem_event(TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_creem_subscription_snapshot(
 p_organization_id UUID,
 p_subscription_id TEXT,
 p_customer_id TEXT,
 p_product_id TEXT,
 p_plan_name TEXT,
 p_status TEXT,
 p_seats INTEGER,
 p_period_end TIMESTAMPTZ,
 p_test_mode BOOLEAN,
 p_updated_at TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected INTEGER;
BEGIN
 IF p_plan_name NOT IN ('individual','pro','team')
  OR p_status NOT IN ('active','trialing','past_due','cancelled','paused','expired')
  OR p_seats < 1 OR p_seats > 500 OR p_updated_at IS NULL OR p_subscription_id IS NULL
 THEN RAISE EXCEPTION 'Invalid Creem subscription snapshot'; END IF;
 UPDATE public.organizations
 SET billing_provider='creem', creem_subscription_id=p_subscription_id,
  creem_customer_id=p_customer_id, creem_product_id=p_product_id,
  creem_test_mode=p_test_mode, creem_subscription_updated_at=p_updated_at,
  plan_name=p_plan_name, subscription_status=p_status,
  seat_limit=p_seats, subscription_ends_at=p_period_end
 WHERE id=p_organization_id
 AND (ls_subscription_id IS NULL OR subscription_status='expired')
 AND (billing_provider IS NULL OR billing_provider='creem')
 AND (creem_subscription_id IS NULL OR creem_subscription_id=p_subscription_id)
 AND (creem_test_mode IS NULL OR creem_test_mode=p_test_mode)
 AND (creem_subscription_updated_at IS NULL OR creem_subscription_updated_at<=p_updated_at)
 AND creem_payment_hold=FALSE;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION public.apply_creem_subscription_snapshot(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TIMESTAMPTZ,BOOLEAN,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_creem_subscription_snapshot(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TIMESTAMPTZ,BOOLEAN,TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.hold_creem_subscription(p_subscription_id TEXT, p_reason TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected INTEGER;
BEGIN
 IF p_reason NOT IN ('refund.created','dispute.created') THEN RAISE EXCEPTION 'Invalid payment hold reason'; END IF;
 UPDATE public.organizations SET creem_payment_hold=TRUE, subscription_status='expired'
 WHERE creem_subscription_id=p_subscription_id AND billing_provider='creem';
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION public.hold_creem_subscription(TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_creem_subscription(TEXT,TEXT) TO service_role;
