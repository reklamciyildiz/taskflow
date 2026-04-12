-- Kanban: stable order within each status column (board drag-and-drop)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS board_position INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN tasks.board_position IS 'Sort order within (team, project, status); lower = higher on board';

CREATE INDEX IF NOT EXISTS idx_tasks_team_project_status_board_pos
  ON tasks (team_id, project_id, status, board_position);
