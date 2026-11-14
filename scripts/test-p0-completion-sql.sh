#!/usr/bin/env bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY,
  column_config jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid,
  status text NOT NULL,
  title text NOT NULL DEFAULT 'Example task'
);
INSERT INTO public.projects(id,column_config) VALUES
 ('11111111-1111-4111-8111-111111111111',
  '[{"id":"todo","isTerminal":false},{"id":"review","isTerminal":true},{"id":"closed","isTerminal":true}]');
-- Historical completion: should retain unknown (NULL) after migration.
INSERT INTO public.tasks(id,organization_id,project_id,status) VALUES
 ('22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111','review');
SQL
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261114120000_p0_task_completion_timestamp.sql
# migration idempotence
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261114120000_p0_task_completion_timestamp.sql
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  ts timestamptz;
  new_ts timestamptz;
  old_at timestamptz;
BEGIN
  SELECT completed_at INTO old_at FROM public.tasks
    WHERE id='22222222-2222-4222-8222-222222222222';
  IF old_at IS NOT NULL THEN RAISE EXCEPTION 'Legacy completion was falsely backfilled'; END IF;
  INSERT INTO public.tasks(id,organization_id,project_id,status) VALUES
    ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111','todo');
  UPDATE public.tasks SET status='review' WHERE id='44444444-4444-4444-8444-444444444444';
  SELECT completed_at INTO ts FROM public.tasks WHERE id='44444444-4444-4444-8444-444444444444';
  IF ts IS NULL THEN RAISE EXCEPTION 'Terminal transition not recorded'; END IF;
  UPDATE public.tasks SET title='edited title', completed_at='2000-01-01'
    WHERE id='44444444-4444-4444-8444-444444444444';
  SELECT completed_at INTO new_ts FROM public.tasks WHERE id='44444444-4444-4444-8444-444444444444';
  IF new_ts IS DISTINCT FROM ts THEN RAISE EXCEPTION 'Edit changed completion date'; END IF;
  UPDATE public.tasks SET status='closed' WHERE id='44444444-4444-4444-8444-444444444444';
  SELECT completed_at INTO new_ts FROM public.tasks WHERE id='44444444-4444-4444-8444-444444444444';
  IF new_ts IS DISTINCT FROM ts THEN RAISE EXCEPTION 'Terminal-to-terminal changed date'; END IF;
  UPDATE public.tasks SET status='todo' WHERE id='44444444-4444-4444-8444-444444444444';
  SELECT completed_at INTO new_ts FROM public.tasks WHERE id='44444444-4444-4444-8444-444444444444';
  IF new_ts IS NOT NULL THEN RAISE EXCEPTION 'Reopened task still completed'; END IF;
  UPDATE public.tasks SET status='review' WHERE id='44444444-4444-4444-8444-444444444444';
  SELECT completed_at INTO new_ts FROM public.tasks WHERE id='44444444-4444-4444-8444-444444444444';
  IF new_ts IS NULL OR new_ts < ts THEN RAISE EXCEPTION 'Re-completion did not record a valid date'; END IF;
  INSERT INTO public.tasks(id,organization_id,project_id,status) VALUES
    ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333',null,'done');
  SELECT completed_at INTO new_ts FROM public.tasks WHERE id='55555555-5555-4555-8555-555555555555';
  IF new_ts IS NULL THEN RAISE EXCEPTION 'General canonical done missed'; END IF;
  INSERT INTO public.tasks(id,organization_id,project_id,status) VALUES
    ('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333',null,'review');
  SELECT completed_at INTO new_ts FROM public.tasks WHERE id='66666666-6666-4666-8666-666666666666';
  IF new_ts IS NOT NULL THEN RAISE EXCEPTION 'General unknown stage falsely classified terminal'; END IF;
END $$;
SQL
echo 'P0 completion timestamp integration test passed'
