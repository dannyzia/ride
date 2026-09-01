-- 0051: Rental options/schedule + overtime rate + car rental vehicle types
-- Zia rulings 13–16 (plans/marketplace-bidding-implementation-spec-v2.md §0.1):
--   rental_requests.rental_options (ruling 13 — comma-separated option/condition chips)
--   rental_requests.scheduled_start_at + duration_hours (ruling 14 — NULL start = NOW)
--   rental_bids.overtime_rate_bdt (ruling 15 — paisa, display-only; consumed by Phase 2b bid UI)
--   rental_vehicle_type += car_* values mirroring vehicle_type enum (ruling 16)
-- NOTE: hand-authored (drizzle-kit generate requires TTY — see 0047/0048 note). Additive only.

ALTER TABLE "rental_requests" ADD COLUMN IF NOT EXISTS "rental_options" text;
--> statement-breakpoint
ALTER TABLE "rental_requests" ADD COLUMN IF NOT EXISTS "scheduled_start_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "rental_requests" ADD COLUMN IF NOT EXISTS "duration_hours" integer;
--> statement-breakpoint
ALTER TABLE "rental_bids" ADD COLUMN IF NOT EXISTS "overtime_rate_bdt" integer;
--> statement-breakpoint
ALTER TYPE "rental_vehicle_type" ADD VALUE IF NOT EXISTS 'car_compact';
--> statement-breakpoint
ALTER TYPE "rental_vehicle_type" ADD VALUE IF NOT EXISTS 'car_economy';
--> statement-breakpoint
ALTER TYPE "rental_vehicle_type" ADD VALUE IF NOT EXISTS 'car_comfort';
--> statement-breakpoint
ALTER TYPE "rental_vehicle_type" ADD VALUE IF NOT EXISTS 'car_premium';
--> statement-breakpoint
ALTER TYPE "rental_vehicle_type" ADD VALUE IF NOT EXISTS 'car_xl';
