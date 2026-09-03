-- R2.1: driver_earnings_goals table (schema exists at src/db/schema.ts:3372)
-- Precondition: verify table does NOT exist in live DB first.
-- SELECT count(*) FROM information_schema.columns WHERE table_name='driver_earnings_goals';
-- If present (pushed earlier), this migration is for fresh-install history only.
CREATE TABLE IF NOT EXISTS driver_earnings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id),
  period VARCHAR(20) NOT NULL,
  target_bdt INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active goal per driver at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS driver_earnings_goals_active_idx
  ON driver_earnings_goals (driver_user_id)
  WHERE is_active = true;

-- Fast lookup by driver
CREATE INDEX IF NOT EXISTS driver_earnings_goals_driver_idx
  ON driver_earnings_goals (driver_user_id);
