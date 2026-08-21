-- Notification idempotency + 60-minute ride reminder
-- Adds idempotency_key to notifications for global dedup, and
-- reminder_60_sent to rides for the T-60m scheduled-ride reminder.
--
-- Rollback SQL:
--   DROP INDEX IF EXISTS notifications_idempotency_idx;
--   ALTER TABLE notifications DROP COLUMN IF EXISTS idempotency_key;
--   ALTER TABLE rides DROP COLUMN IF EXISTS reminder_60_sent;
--

-- 1. Add idempotency_key to notifications (nullable — existing rows have no key)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS idempotency_key varchar(128);

-- 2. Unique index for dedup (nullable columns: partial index excludes NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_idx
  ON notifications USING btree (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Add reminder_60_sent to rides (default false — existing rows unaffected)
ALTER TABLE rides ADD COLUMN IF NOT EXISTS reminder_60_sent boolean DEFAULT false;
