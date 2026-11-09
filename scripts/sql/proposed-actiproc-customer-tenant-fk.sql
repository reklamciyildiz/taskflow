-- DRAFT ONLY: customer-to-Action tenant integrity. DO NOT EXECUTE ON
-- Production WITHOUT OWNER APPROVAL AND A STAGING REHEARSAL.
-- This file is intentionally under scripts/sql/, NOT supabase/migrations/.
--
-- Prerequisites:
-- 1. Execute scripts/sql/actiproc-customer-tenant-readonly-audit.sql.
-- 2. Confirm ZERO mismatches in tasks.customer_id -> customers.organization_id.
-- 3. Take a backup, check PostgreSQL version supports ON DELETE SET NULL (column).
-- 4. Rehearse delete/nulling, concurrent INSERT/UPDATE, rollback and lock duration.
-- 5. Run during a separately approved deployment with operator supervision.
--
-- The planned FK protects against a race between the application-level
-- customer ownership check and a task INSERT/UPDATE.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.customers c ON c.id = t.customer_id
    WHERE t.organization_id IS DISTINCT FROM c.organization_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant Action/customer references exist; abort safely';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.customers'::regclass
      AND conname='customers_org_id_id_unique'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_org_id_id_unique UNIQUE (organization_id,id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.tasks'::regclass
      AND conname='tasks_customer_tenant_fk'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_customer_tenant_fk
      FOREIGN KEY (organization_id,customer_id)
      REFERENCES public.customers (organization_id,id)
      ON DELETE SET NULL (customer_id) NOT VALID;
  END IF;
END;
$$;
COMMIT;

-- Run ONLY after reviewing any pre-existing orphan/mismatch findings:
-- ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_customer_tenant_fk;
