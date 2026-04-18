-- Project visibility + per-project membership ACL
-- Goal:
-- - Allow team admins to restrict which teammates can see a process (project)
-- - Keep backward compatibility: existing projects default to team-visible

-- ---------------------------------------------------------------------------
-- 1) Visibility enum (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_visibility') THEN
    CREATE TYPE project_visibility AS ENUM ('team', 'restricted', 'private');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) projects: add visibility + created_by
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS visibility project_visibility NOT NULL DEFAULT 'team';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by) WHERE created_by IS NOT NULL;

COMMENT ON COLUMN projects.visibility IS 'team=all team members; restricted=explicit project_members; private=only created_by (+ org admins).';
COMMENT ON COLUMN projects.created_by IS 'User who created the project (used for private visibility).';

-- ---------------------------------------------------------------------------
-- 3) project_members: explicit membership for restricted/private projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- future-proof: role can evolve (viewer/editor). For now, membership = visibility.
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);

COMMENT ON TABLE project_members IS 'Explicit per-project membership (used when projects.visibility != team).';

