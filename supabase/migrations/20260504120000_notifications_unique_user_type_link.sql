-- Dedupe existing rows so (user_id, type, link) is unique for non-null `link`.
-- Keeps the oldest row per key (min created_at, then min id).
DELETE FROM notifications n
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, link
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM notifications
  WHERE link IS NOT NULL
) d
WHERE n.id = d.id
  AND d.rn > 1;

-- Prevent duplicate due/overdue reminder rows (concurrent cron) and historical dupes (e.g. task_assigned + same link).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_user_type_link
ON notifications (user_id, type, link)
WHERE link IS NOT NULL;
