-- C3-5 (STAGE C3-FIX, F-05 cash handshake): rider-noted cash tendered
-- (change-making) + driver-confirmed amount received. Integer paisa.
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "rider_cash_tendered_bdt" integer;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "rider_cash_noted_at" timestamptz;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "driver_cash_received_bdt" integer;
