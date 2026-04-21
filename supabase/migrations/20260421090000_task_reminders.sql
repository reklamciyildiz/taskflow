-- Task reminders (Superlist-style): store scheduled reminder instants for each task.
-- This is intentionally a JSONB array so we can evolve without breaking.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminders JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tasks.reminders IS 'Scheduled reminder instants (UTC ISO strings), e.g. ["2026-04-21T08:55:00.000Z", ...]';

