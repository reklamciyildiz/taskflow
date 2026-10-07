-- Independent TipTap notes attached to actions (tasks).
-- Existing learnings/checklist columns intentionally remain untouched.

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(240) NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'note'
    CHECK (type IN ('note', 'learning', 'idea', 'decision')),
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
    CHECK (jsonb_typeof(content) = 'object' AND content->>'type' = 'doc'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_task_updated ON notes(task_id, updated_at DESC);
CREATE INDEX idx_notes_organization ON notes(organization_id);
CREATE INDEX idx_notes_team ON notes(team_id);
CREATE INDEX idx_notes_author ON notes(author_id);

COMMENT ON TABLE notes IS
  'Independent TipTap documents attached to actions. Legacy tasks.learnings fields are not migrated or modified.';
COMMENT ON COLUMN notes.content IS 'TipTap JSON document (root node type must be doc).';

-- organization_id/team_id are deliberately denormalized for fast tenant filtering.
-- Always derive them from the parent task so they cannot drift or be forged.
CREATE OR REPLACE FUNCTION set_note_task_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_organization_id UUID;
  parent_team_id UUID;
BEGIN
  SELECT organization_id, team_id
    INTO parent_organization_id, parent_team_id
  FROM tasks
  WHERE id = NEW.task_id;

  IF parent_organization_id IS NULL OR parent_team_id IS NULL THEN
    RAISE EXCEPTION 'Parent task not found for note';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE id = NEW.author_id
      AND organization_id = parent_organization_id
  ) THEN
    RAISE EXCEPTION 'Note author must belong to the task organization';
  END IF;

  NEW.organization_id := parent_organization_id;
  NEW.team_id := parent_team_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notes_set_task_scope
  BEFORE INSERT OR UPDATE OF task_id, organization_id, team_id, author_id ON notes
  FOR EACH ROW EXECUTE FUNCTION set_note_task_scope();

CREATE TRIGGER notes_set_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- The application reads/writes through authenticated API routes using the service role.
-- Match the current server-only security model: RLS denies direct anon/JWT access because
-- no client policies are created; API routes enforce organization, team role, and project ACLs.
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
