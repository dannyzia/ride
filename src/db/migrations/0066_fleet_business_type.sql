-- S2.1 D-2 (§16): business fleets mint as fleet_type 'BUSINESS', not 'NATIVE'.
--
-- The implicit solo NATIVE fleet is minted at registration for every driver
-- (app/api/register+api.ts); the fleet-owner ROLE application mints its own
-- fleet. Before this migration BOTH minted 'NATIVE', so heldRoles' oldest-wins
-- status read picked the solo fleet and reported the wrong state.
--
-- D5 rule: ALTER TYPE ... ADD VALUE ships as its own statement/run; it never
-- shares a transaction block with the backfill below (apply-migration.js runs
-- statements separately). 'BUSINESS' is consumed by
-- launchRoles.createRoleRecord + heldRoles (same commit).
ALTER TYPE "fleet_type" ADD VALUE 'BUSINESS'; --> statement-breakpoint

-- Backfill: the role-application fleets minted as NATIVE before this change —
-- identified by a trade license (the implicit solo NATIVE fleet never has one).
UPDATE "fleets"
SET "fleet_type" = 'BUSINESS', "updated_at" = NOW()
WHERE "trade_license_url" IS NOT NULL
  AND "fleet_type" = 'NATIVE';
