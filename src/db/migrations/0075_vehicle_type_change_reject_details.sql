-- S7 (plan 27 §7 A3 + F-30/E2) — structured rejection for vehicle-type change
-- requests. Mirrors the F-30/F-03 shape already used by shops/fleets/couriers
-- (migration 0065): { code, field, example, internal_note }, where internal_note
-- is admin-only and never returned to the driver.
--
-- Additive and nullable: existing rows keep their free-text reason_text; the
-- reject route writes BOTH (reason_text for legacy readers, reject_details for
-- the structured payload) so nothing that reads reason_text today breaks.
ALTER TABLE vehicle_type_changes ADD COLUMN IF NOT EXISTS reject_details jsonb;
