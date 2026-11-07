-- Five-product Creem catalog: bind an authorized purchase intent to the
-- exact recurring product and cadence. Needed BEFORE enabling live checkout.
-- Old test checkout intents are intentionally left nullable; webhook code
-- accepts their legacy monthly (or Individual yearly) product mapping only.
ALTER TABLE public.creem_checkout_intents
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_interval TEXT;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname='creem_checkout_product_interval_check'
                  AND conrelid='public.creem_checkout_intents'::regclass) THEN
  ALTER TABLE public.creem_checkout_intents
    ADD CONSTRAINT creem_checkout_product_interval_check CHECK (
      (product_id IS NULL AND billing_interval IS NULL)
      OR
      (product_id ~ '^prod_[A-Za-z0-9]+$'
       AND billing_interval IN ('monthly','yearly'))
    );
 END IF;
END $$;

-- Existing RLS and service_role-only write policy are unchanged.
