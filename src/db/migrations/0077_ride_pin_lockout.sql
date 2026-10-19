-- C3-4 (STAGE C3-FIX) — start-PIN attempt counter + lockout timestamp.
-- ×3 mismatches lock the ride (correct PIN fails after lock) + admin notify.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS start_pin_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS start_pin_locked_at timestamptz;
