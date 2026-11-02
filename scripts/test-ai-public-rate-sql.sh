#!/usr/bin/env bash
# Disposable CI Postgres ONLY; never aim this fixture script at primary Supabase.
set -euo pipefail
if [[ "$(printenv PGHOST)" != "localhost" ]]; then
  echo "Unsafe database host for SQL test" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.users (id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id));
CREATE TABLE public.ai_quota_counters (
  scope_type text NOT NULL, scope_id uuid NOT NULL, bucket_start date NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope_type,scope_id,bucket_start));
CREATE TABLE public.ai_quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  feature text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_quota_reservations_user_created_idx
  ON public.ai_quota_reservations(user_id,created_at DESC);
INSERT INTO public.organizations VALUES('00000000-0000-4000-8000-000000000001');
INSERT INTO public.users VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001');
\i supabase/migrations/20261102210000_ai_public_fair_use_burst_guard.sql

DO $test$
DECLARE row record; key1 uuid; keyval uuid; day_count integer; month_count integer;
BEGIN
  FOR i IN 1..12 LOOP
    keyval:=gen_random_uuid();
    IF i=1 THEN key1:=keyval; END IF;
    SELECT * INTO row FROM public.reserve_ai_quota(keyval,
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000001','axiom-chat',50,300);
    IF NOT row.allowed THEN RAISE EXCEPTION 'Request % wrongly rejected',i; END IF;
  END LOOP;
  SELECT * INTO row FROM public.reserve_ai_quota(gen_random_uuid(),
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001','axiom-chat',50,300);
  IF row.allowed OR position('Minute' IN coalesce(row.reason,''))=0 THEN
    RAISE EXCEPTION '13th request bypassed minute guard';
  END IF;
  SELECT * INTO row FROM public.reserve_ai_quota(key1,
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001','axiom-chat',50,300);
  IF NOT row.allowed THEN RAISE EXCEPTION 'Idempotent retry rejected'; END IF;
  SELECT request_count INTO day_count FROM public.ai_quota_counters
    WHERE scope_type='user_day' AND scope_id='00000000-0000-4000-8000-000000000011';
  SELECT request_count INTO month_count FROM public.ai_quota_counters
    WHERE scope_type='organization_month' AND scope_id='00000000-0000-4000-8000-000000000001';
  IF day_count<>12 OR month_count<>12 THEN
    RAISE EXCEPTION 'Denied/duplicate requests incorrectly used quota';
  END IF;
  FOR i IN 1..10 LOOP
    SELECT * INTO row FROM public.reserve_ai_quota(gen_random_uuid(),
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000001','axiom-chat',10,30);
    IF NOT row.allowed THEN RAISE EXCEPTION 'Free request % wrongly rejected',i; END IF;
  END LOOP;
  SELECT * INTO row FROM public.reserve_ai_quota(gen_random_uuid(),
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000001','axiom-chat',10,30);
  IF row.allowed OR position('Daily' IN coalesce(row.reason,''))=0 THEN
    RAISE EXCEPTION 'Free daily cap bypassed';
  END IF;
  IF NOT public.ai_public_burst_guard_ready() THEN
    RAISE EXCEPTION 'Readiness probe must return true';
  END IF;
  IF has_function_privilege('authenticated',
    'public.reserve_ai_quota(uuid,uuid,uuid,text,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.ai_public_burst_guard_ready()','EXECUTE')
  THEN RAISE EXCEPTION 'Non-service client has privileged quota RPC access'; END IF;
END $test$;
SQL

# 32 simultaneous requests by one user: at most twelve may pass.
pids=()
for i in $(seq 1 32); do
  psql -X -At -v ON_ERROR_STOP=1 -c \
    "SELECT allowed FROM public.reserve_ai_quota(gen_random_uuid(),
       '00000000-0000-4000-8000-000000000013',
       '00000000-0000-4000-8000-000000000001','axiom-chat',150,300)" \
    >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE admitted integer; monthly integer;
BEGIN
 SELECT count(*) INTO admitted FROM public.ai_quota_reservations
   WHERE user_id='00000000-0000-4000-8000-000000000013';
 SELECT request_count INTO monthly FROM public.ai_quota_counters
   WHERE scope_type='organization_month' AND
     scope_id='00000000-0000-4000-8000-000000000001';
 IF admitted<>12 OR monthly<>34 THEN
   RAISE EXCEPTION 'Parallel requests exceeded 12/minute: %, %',admitted,monthly;
 END IF;
END $test$;
SQL
echo 'PASS: Postgres atomic minute guard, idempotence, daily limit, ACL and concurrent admission'
