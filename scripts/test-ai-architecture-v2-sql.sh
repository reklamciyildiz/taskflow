#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.users(
  id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id)
);
CREATE TABLE public.ai_provider_token_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  provider text NOT NULL,
  model text NOT NULL,
  reserved_tokens integer NOT NULL,
  actual_tokens integer,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
CREATE INDEX ai_provider_token_reservations_window_idx
  ON public.ai_provider_token_reservations(provider,model,created_at DESC);

\i supabase/migrations/20261112183000_ai_provider_capacity_v2.sql
-- Migration can be re-applied safely.
\i supabase/migrations/20261112183000_ai_provider_capacity_v2.sql

INSERT INTO organizations VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO users VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111');

DO $$
DECLARE
  v boolean;
  rid uuid;
  num bigint;
BEGIN
  -- A Qwen request consumes most of this Groq account's combined TPM.
  SELECT allowed,reservation_id INTO v,rid FROM public.reserve_ai_provider_tokens_v2(
    '00000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'groq','qwen/qwen3.8-27b',350,1000,600,10,10);
  IF NOT v OR rid IS NULL THEN
    RAISE EXCEPTION 'Expected first Groq admission to succeed';
  END IF;

  -- Idempotent replay does not burn a second request token.
  SELECT allowed,reservation_id INTO v,rid FROM public.reserve_ai_provider_tokens_v2(
    '00000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'groq','qwen/qwen3.8-27b',350,1000,600,10,10);
  IF NOT v OR (SELECT count(*) FROM ai_provider_token_reservations)<>1 THEN
    RAISE EXCEPTION 'Idempotent request leaked extra tokens';
  END IF;

  -- Independent models are NOT independent accounts. 350+300>600.
  SELECT allowed INTO v FROM public.reserve_ai_provider_tokens_v2(
    '00000000-0000-4000-8000-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'groq','openai/gpt-oss-120b',300,1000,600,10,10);
  IF v IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cross-model Groq TPM overflow was accepted';
  END IF;
  SELECT allowed INTO v FROM public.reserve_ai_provider_tokens_v2(
    '00000000-0000-4000-8000-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'groq','openai/gpt-oss-120b',200,1000,600,10,10);
  IF v IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Independent model within provider budget was rejected';
  END IF;

  -- Provider-side RPM limit applies across different Groq models and users.
  SELECT allowed INTO v FROM public.reserve_ai_provider_tokens_v2(
    '00000000-0000-4000-8000-000000000004',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'groq','openai/gpt-oss-20b',1,1000,1000,10,2);
  IF v IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Global Groq RPM limit bypassed';
  END IF;

  -- Independent OpenAI fallback does not reuse Groq account capacity.
  SELECT allowed INTO v FROM public.reserve_ai_provider_tokens_v2(
    '00000000-0000-4000-8000-000000000005',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'openai','gpt-fallback',400,1000,600,10,10);
  IF v IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Independent provider fallback capacity was blocked';
  END IF;

  -- A replay may never impersonate another authorized user.
  BEGIN
    SELECT allowed INTO v FROM public.reserve_ai_provider_tokens_v2(
      '00000000-0000-4000-8000-000000000001',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111',
      'groq','qwen/qwen3.8-27b',350,1000,600,10,10);
    RAISE EXCEPTION 'Cross-user idempotency scope bypassed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Cross-user idempotency scope bypassed' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO num FROM public.ai_provider_token_reservations;
  IF num<>3 THEN RAISE EXCEPTION 'Denied requests persisted unwanted reservations'; END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('anon',
    'public.reserve_ai_provider_tokens_v2(uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'Anon can call privileged admission function';
  END IF;
  IF has_function_privilege('authenticated',
    'public.reserve_ai_provider_tokens_v2(uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated browser can call privileged admission function';
  END IF;
END
$$;
SELECT 'ai-v2-admission-sql-passed' AS result;
SQL
