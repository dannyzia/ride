-- S6 (plan 27 §6.1 + §12) — delivery dispatch runtime + COD settlement storage.
-- D5: no enum changes; purely additive columns + two new money tables (D1 posture).
--
-- 1) Driver Deliveries toggle (Amendment 2: default OFF, auto-OFF while carrying a rider).
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deliveries_enabled boolean NOT NULL DEFAULT false;

-- 2) Sequential single-offer dispatch state on the universal legs table.
--    The chain itself is in-memory (INSTANCE_COUNT=1) but the offer target,
--    expiry, attempt counter and tried-set are persisted so a restart cannot
--    re-offer beyond delivery_max_suggestions or forget a declined candidate.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS offered_to_user_id uuid REFERENCES users(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS offer_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS tried_claimer_ids uuid[] NOT NULL DEFAULT '{}';

-- 3) Delivery-man surface state (F-15): attempted-delivery, proof, COD cash entry.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS attempted_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS proof_photo_url text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS amount_collected_bdt integer;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS amount_collected_at timestamptz;

-- 4) Shop-side assignment + handover codes (§6.1 steps 4–6, F-11).
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS courier_user_id uuid REFERENCES users(id);
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS pickup_code varchar(6);
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS delivery_otp varchar(6);
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS courier_assigned_at timestamptz;

-- 5) delivery_earnings (plan §12): courier earnings credit, append-only
--    (no updated_at — money-tables rule), one row per delivered leg
--    (unique leg index = double-earnings backstop, same shape as
--    shop_ledger's (order_id, entry_type) partial unique).
CREATE TABLE IF NOT EXISTS delivery_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_man_user_id uuid NOT NULL REFERENCES users(id),
  leg_id uuid NOT NULL REFERENCES deliveries(id),
  order_id uuid NOT NULL,
  fee_bdt integer NOT NULL,
  commission_bdt integer NOT NULL DEFAULT 0,
  net_bdt integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_earnings_leg_uq ON delivery_earnings (leg_id);
CREATE INDEX IF NOT EXISTS delivery_earnings_user_idx ON delivery_earnings (delivery_man_user_id, created_at);
ALTER TABLE delivery_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_earnings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON delivery_earnings FROM anon, authenticated;

-- 6) courier_remittance_dues (plan §12 + F-33): COD cash the courier collected
--    and owes onward (items total; the fee is the courier's earnings above).
--    status: pending | remitted | adjusted. Overdue → reminders → dispatch
--    hold (config: cod_remittance_overdue_days / cod_dispatch_hold_threshold_bdt).
CREATE TABLE IF NOT EXISTS courier_remittance_dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_man_user_id uuid NOT NULL REFERENCES users(id),
  leg_id uuid NOT NULL REFERENCES deliveries(id),
  order_id uuid NOT NULL,
  amount_bdt integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  remitted_at timestamptz,
  remittance_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS courier_remittance_dues_leg_uq ON courier_remittance_dues (leg_id);
CREATE INDEX IF NOT EXISTS courier_remittance_dues_user_idx ON courier_remittance_dues (delivery_man_user_id, status);
ALTER TABLE courier_remittance_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_remittance_dues FORCE ROW LEVEL SECURITY;
REVOKE ALL ON courier_remittance_dues FROM anon, authenticated;
