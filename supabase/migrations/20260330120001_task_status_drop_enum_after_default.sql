-- Onarım: Eski 20260330120000 sürümünde DROP TYPE task_status, status DEFAULT'u enum'a
-- bağlı kaldığı için 2BP01 verdiyse bu dosyayı bir kez çalıştırın.
-- Idempotent: güvenli şekilde tekrar çalıştırılabilir.

ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;

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
    ALTER TABLE tasks
      ALTER COLUMN status TYPE TEXT USING status::text;
  END IF;
END $$;

ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'todo';

DROP TYPE IF EXISTS task_status;
