-- Phase 3.2: allow immutable proposals for bounded Action updates and Planner scheduling.
-- No canonical Action or schedule data is changed by this migration.
-- Prerequisite: 20261018201000_ai_write_tool_audit_atomicity.sql
BEGIN;

ALTER TABLE public.ai_write_proposals
  DROP CONSTRAINT IF EXISTS ai_write_proposals_tool_name_check;

ALTER TABLE public.ai_write_proposals
  ADD CONSTRAINT ai_write_proposals_tool_name_check
  CHECK (tool_name IN (
    'create_action',
    'create_note',
    'update_checklist',
    'update_action',
    'schedule_action'
  ));

COMMIT;
