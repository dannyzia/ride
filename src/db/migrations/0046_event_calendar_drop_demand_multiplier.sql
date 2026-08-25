-- Drop event_calendar.demand_multiplier: unused end-to-end (zero references
-- outside src/db/schema.ts), and shaped exactly like a fare-affecting field.
-- Removed for the same reason surge was removed (Ride Fare Framework v1 §1,
-- Amendment 2 of the implementation validation addendum): a wired-but-inert
-- demand lever is one accidental edit away from becoming a live one.
-- event_calendar itself is retained — legitimate future use is feeding
-- active events into the zone_heat/dispatch engine (Phase C) and rider
-- informational notices, never fare calculation.

ALTER TABLE "event_calendar" DROP COLUMN IF EXISTS "demand_multiplier";
ALTER TABLE "event_calendar" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
