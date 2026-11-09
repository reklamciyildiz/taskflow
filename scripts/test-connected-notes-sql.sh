#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.teams(id uuid PRIMARY KEY);
CREATE TABLE public.users(id uuid PRIMARY KEY);
CREATE TABLE public.tasks(
  id uuid PRIMARY KEY, organization_id uuid, team_id uuid, checklist_blocks jsonb
);
CREATE TABLE public.notes(
  id uuid PRIMARY KEY, task_id uuid, organization_id uuid, team_id uuid
);
\i supabase/migrations/20261109190000_connected_checklist_notes.sql

INSERT INTO organizations VALUES
  ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO teams VALUES
  ('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
INSERT INTO users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO tasks VALUES
  ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-333333333333',
   '{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"id":"item-1","checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Work"}]}]}]}]}'::jsonb),
  ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222',
   '44444444-4444-4444-8444-444444444444',
   '{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"id":"item-2"}}]}]}'::jsonb);
INSERT INTO notes VALUES
  ('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555',
   '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333'),
  ('88888888-8888-4888-8888-888888888888','66666666-6666-4666-8666-666666666666',
   '22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444');

INSERT INTO note_checklist_links(note_id,task_id,organization_id,team_id,checklist_item_id,created_by)
VALUES('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',
  'item-1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
DO $$ BEGIN
  IF (SELECT organization_id FROM note_checklist_links LIMIT 1)
    <> '11111111-1111-4111-8111-111111111111'::uuid THEN
    RAISE EXCEPTION 'Trigger did not derive canonical tenant identity';
  END IF;
  IF has_table_privilege('authenticated','public.note_checklist_links','SELECT')
    OR has_table_privilege('anon','public.note_checklist_links','SELECT') THEN
    RAISE EXCEPTION 'JWT role can read links directly';
  END IF;
END $$;

-- Incorrect Action and a missing checklist item both fail at the DB layer.
DO $$ BEGIN
  BEGIN
    INSERT INTO note_checklist_links(note_id,task_id,organization_id,team_id,checklist_item_id)
    VALUES('88888888-8888-4888-8888-888888888888','55555555-5555-4555-8555-555555555555',
      '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','item-1');
    RAISE EXCEPTION 'Cross-tenant note unexpectedly linked';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO note_checklist_links(note_id,task_id,organization_id,team_id,checklist_item_id)
    VALUES('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555',
      '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','deleted-item');
    RAISE EXCEPTION 'Missing item unexpectedly linked';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Reordering/marking checked does not destroy the relation.
UPDATE tasks SET checklist_blocks=jsonb_set(checklist_blocks,
  '{content,0,content,0,attrs,checked}','true'::jsonb)
WHERE id='55555555-5555-4555-8555-555555555555';
DO $$ BEGIN
  IF (SELECT count(*) FROM note_checklist_links)<>1 THEN
    RAISE EXCEPTION 'Content edit destroyed a stable link';
  END IF;
END $$;

-- Deletion prunes only the relationship, never the Note.
UPDATE tasks SET checklist_blocks='{"type":"doc","content":[]}'::jsonb
WHERE id='55555555-5555-4555-8555-555555555555';
DO $$ BEGIN
  IF (SELECT count(*) FROM note_checklist_links)<>0
     OR (SELECT count(*) FROM notes)<>2 THEN
    RAISE EXCEPTION 'Removing checklist destroyed a Note or retained an orphan link';
  END IF;
END $$;
SELECT 'connected-note-database-regressions-passed' AS result;
SQL
