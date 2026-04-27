-- Add password hash support for Credentials login.
-- Nullable so Google-only users remain valid.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Optional index for fast lookup (email already indexed in most setups; keep safe/no-op if not)
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

