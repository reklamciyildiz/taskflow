-- Faz 1: Projects (süreç / boru hattı), task journaling, dinamik status (TEXT)
-- Requires: organizations, teams, tasks tables (existing Axiom schema)

-- ---------------------------------------------------------------------------
-- 1) projects: organization-scoped pipeline; optional link to a team
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  column_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id) WHERE team_id IS NOT NULL;

COMMENT ON TABLE projects IS 'Per-process pipeline config (dynamic board columns); optional team scope';
COMMENT ON COLUMN projects.column_config IS 'JSON array: [{ "id", "title", "color?", "isTerminal?" }, ...]';

-- ---------------------------------------------------------------------------
-- 2) tasks: link to project, journal, learnings
-- ---------------------------------------------------------------------------
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS journal_logs JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS learnings TEXT;

COMMENT ON COLUMN tasks.journal_logs IS 'Timestamped work log entries: [{ id, text, created_at }, ...]';
COMMENT ON COLUMN tasks.learnings IS 'Captured knowledge when closing / reflecting on the task';

-- ---------------------------------------------------------------------------
-- 3) status: PG enum -> TEXT so arbitrary pipeline column ids are allowed
-- Must DROP DEFAULT first: otherwise the default still references task_status
-- and DROP TYPE task_status fails with 2BP01.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'status'
      AND udt_name = 'task_status'
  ) THEN
    ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE tasks
      ALTER COLUMN status TYPE TEXT USING status::text;
    ALTER TABLE tasks
      ALTER COLUMN status SET DEFAULT 'todo';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'status'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE tasks
      ALTER COLUMN status TYPE TEXT USING status::text;
    ALTER TABLE tasks
      ALTER COLUMN status SET DEFAULT 'todo';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND udt_name = 'task_status'
  ) THEN
    DROP TYPE IF EXISTS task_status;
  END IF;
END $$;
