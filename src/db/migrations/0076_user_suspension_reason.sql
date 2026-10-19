-- C2-1 (STAGE C2-FIX) — stored suspension reason surfaced on 403 account_suspended.
-- Additive and nullable: existing rows keep NULL (no reason).
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason varchar(500);
