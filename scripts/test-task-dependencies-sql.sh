#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.teams (id uuid PRIMARY KEY);
CREATE TABLE public.users (id uuid PRIMARY KEY);
CREATE TABLE public.projects (id uuid PRIMARY KEY, organization_id uuid, team_id uuid, column_config jsonb NOT NULL);
CREATE TABLE public.team_inbox_boards (
  team_id uuid PRIMARY KEY, organization_id uuid NOT NULL, stages jsonb NOT NULL
);
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  team_id uuid NOT NULL,
  project_id uuid,
  status text NOT NULL DEFAULT 'todo',
  completed_at timestamptz
);
CREATE TABLE public.work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  checklist_item_id text,
  schedule_type text NOT NULL,
  archived_at timestamptz
);
-- P0 trigger supplies authoritative, stage-aware completion semantics.
\i supabase/migrations/20261114120000_p0_task_completion_timestamp.sql
\i supabase/migrations/20261115220000_task_dependencies_foundation.sql

CREATE FUNCTION pg_temp.expect_failure(command text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE reason text;
BEGIN
  BEGIN
    EXECUTE command;
    RAISE EXCEPTION 'Unexpected success of: %', command;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
    IF reason<>expected THEN
      RAISE EXCEPTION 'Expected %, got %',expected,reason;
    END IF;
  END;
END; $$;

INSERT INTO organizations VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO teams VALUES
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555');
INSERT INTO users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO team_inbox_boards(team_id,organization_id,stages) VALUES (
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 '[{"id":"todo","isTerminal":false},{"id":"done","isTerminal":true},{"id":"verified","isTerminal":true}]'
);
INSERT INTO projects VALUES (
 '99999999-9999-4999-8999-999999999999',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '[{"id":"todo","title":"Todo","isTerminal":false},{"id":"accepted","title":"Accepted","isTerminal":true},{"id":"rejected","title":"Rejected","isTerminal":true}]'
);
INSERT INTO tasks(id,organization_id,team_id,project_id,status) VALUES
 ('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',NULL,'todo'),
 ('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',NULL,'todo'),
 ('00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','99999999-9999-4999-8999-999999999999','todo'),
 ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444',NULL,'todo'),
 ('00000000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555',NULL,'todo'),
 ('00000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',NULL,'todo');

-- A General Action without a canonical Inbox board cannot be linked.
INSERT INTO tasks(id,organization_id,team_id,project_id,status) VALUES
 ('00000000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444',NULL,'todo');
SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444')$q$, 'P23_DEPENDENCY_INBOX_UNSYNCED');
-- Forged tenant fields must be overwritten from canonical Action rows.
INSERT INTO task_dependencies(organization_id,team_id,blocker_task_id,blocked_task_id,created_by)
VALUES ('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555',
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
DO $$ BEGIN
  IF (SELECT organization_id FROM task_dependencies LIMIT 1)
    <> '11111111-1111-4111-8111-111111111111'::uuid
    OR (SELECT team_id FROM task_dependencies LIMIT 1)
    <> '33333333-3333-4333-8333-333333333333'::uuid THEN
    RAISE EXCEPTION 'Graph edge scope not derived from Action identity';
  END IF;
  IF has_table_privilege('authenticated','public.task_dependencies','SELECT')
    OR has_table_privilege('anon','public.task_dependencies','SELECT')
    OR has_table_privilege('authenticated','public.task_dependencies','INSERT') THEN
    RAISE EXCEPTION 'JWT role has direct dependency table permissions';
  END IF;
END $$;

INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');

SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$q$, 'P23_DEPENDENCY_CYCLE');
SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$q$, 'P23_DEPENDENCY_SELF');
SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$q$, 'P23_DEPENDENCY_SCOPE');
SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$q$, 'P23_DEPENDENCY_SCOPE');

-- Editing metadata is allowed; entering a terminal stage is blocked until all
-- predecessors finish. A custom Process terminal stage counts as completion.
UPDATE tasks SET status='todo' WHERE id='00000000-0000-4000-8000-000000000002';
SELECT pg_temp.expect_failure($q$UPDATE tasks SET status='done' WHERE id='00000000-0000-4000-8000-000000000002'$q$, 'P23_BLOCKED_COMPLETION');
SELECT pg_temp.expect_failure($q$UPDATE tasks SET status='accepted' WHERE id='00000000-0000-4000-8000-000000000003'$q$, 'P23_BLOCKED_COMPLETION');
UPDATE tasks SET status='done' WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE tasks SET status='done' WHERE id='00000000-0000-4000-8000-000000000002';
UPDATE tasks SET status='accepted' WHERE id='00000000-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT completed_at FROM tasks WHERE id='00000000-0000-4000-8000-000000000003') IS NULL
 THEN RAISE EXCEPTION 'P0 stage-aware completion timestamp was lost'; END IF;
END $$;

-- Reopening a predecessor does not silently reopen a previously completed
-- dependent; it becomes blocked for any future new completion transition.
UPDATE tasks SET status='todo' WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE tasks SET status='rejected' WHERE id='00000000-0000-4000-8000-000000000003';
SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$q$, 'P23_DEPENDENCY_TERMINAL_TARGET');
SELECT pg_temp.expect_failure($q$UPDATE tasks SET team_id='44444444-4444-4444-8444-444444444444' WHERE id='00000000-0000-4000-8000-000000000002'$q$, 'P23_DEPENDENCY_SCOPE_CHANGE');

-- Stage flags cannot be changed behind active links in a Process or General Inbox.
SELECT pg_temp.expect_failure($q$UPDATE projects SET column_config=jsonb_set(column_config,'{2,isTerminal}','false'::jsonb) WHERE id='99999999-9999-4999-8999-999999999999'$q$, 'P23_DEPENDENCY_STAGE_CHANGE');
SELECT pg_temp.expect_failure($q$UPDATE team_inbox_boards SET stages=jsonb_set(stages,'{1,isTerminal}','false'::jsonb) WHERE team_id='33333333-3333-4333-8333-333333333333'$q$, 'P23_DEPENDENCY_STAGE_CHANGE');
SELECT pg_temp.expect_failure($q$DELETE FROM team_inbox_boards WHERE team_id='33333333-3333-4333-8333-333333333333'$q$, 'P23_DEPENDENCY_INBOX_REQUIRED');
SELECT pg_temp.expect_failure($q$DELETE FROM projects WHERE id='99999999-9999-4999-8999-999999999999'$q$, 'P23_DEPENDENCY_PROCESS_REQUIRED');
-- The custom General 'verified' terminal stage is recognized by the DAG guard.
UPDATE tasks SET status='todo' WHERE id='00000000-0000-4000-8000-000000000002';
SELECT pg_temp.expect_failure($q$UPDATE tasks SET status='verified' WHERE id='00000000-0000-4000-8000-000000000002'$q$, 'P23_BLOCKED_COMPLETION');
UPDATE tasks SET status='done' WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE tasks SET status='verified' WHERE id='00000000-0000-4000-8000-000000000002';

-- Active recurring Action schedules cannot be joined to Action-level edges.
INSERT INTO work_schedules(task_id,schedule_type) VALUES('00000000-0000-4000-8000-000000000006','recurring');
SELECT pg_temp.expect_failure($q$INSERT INTO task_dependencies(blocker_task_id,blocked_task_id,organization_id,team_id) VALUES('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$q$, 'P23_DEPENDENCY_RECURRING');
SELECT pg_temp.expect_failure($q$INSERT INTO work_schedules(task_id,schedule_type) VALUES('00000000-0000-4000-8000-000000000002','recurring')$q$, 'P23_DEPENDENCY_RECURRING');
-- Archived recurring schedules and recurring checklist items are independent.
INSERT INTO work_schedules(task_id,schedule_type,archived_at) VALUES('00000000-0000-4000-8000-000000000002','recurring',now());
INSERT INTO work_schedules(task_id,schedule_type,checklist_item_id) VALUES('00000000-0000-4000-8000-000000000002','recurring','check-1');

-- Deleting one Action cascades its edges, never any other Action or schedule.
DELETE FROM tasks WHERE id='00000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM task_dependencies)<>1 THEN
    RAISE EXCEPTION 'Cascading Action deletion left orphan dependency edges';
  END IF;
  IF (SELECT count(*) FROM tasks)<>6 THEN
    RAISE EXCEPTION 'Unlinking unexpectedly deleted a related Action';
  END IF;
END $$;
-- Full tenant deletion must remain possible even when its Actions had edges.
-- In production org_id FKs cascade both projects and Actions.
ALTER TABLE public.tasks ADD CONSTRAINT p23_test_task_org_fk
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT p23_test_project_org_fk
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
DELETE FROM organizations WHERE id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM task_dependencies)<>0
    OR (SELECT COUNT(*) FROM tasks WHERE organization_id='11111111-1111-4111-8111-111111111111')<>0
    OR (SELECT COUNT(*) FROM projects)<>0
    OR (SELECT COUNT(*) FROM tasks WHERE organization_id='22222222-2222-4222-8222-222222222222')<>1
  THEN RAISE EXCEPTION 'Tenant deletion did not cascade safely'; END IF;
END $$;
SELECT 'P2.3.1 PostgreSQL integrity passed' AS result;
SQL
