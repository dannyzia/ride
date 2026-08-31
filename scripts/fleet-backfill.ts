/**
 * **Purpose:**     Universal fleet backfill — every existing driver becomes the
 *                  OWNER of a solo NATIVE fleet; their existing 1:1 vehicle is
 *                  linked via fleet_vehicle_assignments. Applies NOT NULL to
 *                  drivers.fleet_id / vehicles.fleet_id only after 100%
 *                  coverage is verified.
 * **Owner:**       Coding model (Phase 1 — Fleet Management)
 * **Status:**      ACTIVE — run once after `npx drizzle-kit push`
 * **Related (concrete paths):**
 *   - src/db/schema.ts — fleets, fleetMembers, fleetVehicleAssignments,
 *     drivers.fleet_id, vehicles.fleet_id
 *   - lib/fleetAssignment.ts — the runtime write path this script mirrors
 *   - docs/FeatureList/New Feature Plan/Fleet Management/06-FLEET-MANAGEMENT-V5-by-Claude.xml — §backfill_procedure
 * **Last verified:** 2026-08-30, Phase 1 build (tsc/lint clean)
 * **How to update:** Idempotent — safe to re-run (skips drivers that already
 *                    have fleet_id). Run: npx tsx scripts/fleet-backfill.ts
 *                    [--dry-run]
 */
import "./_load-env";
import { db } from "../src/db";
import {
  drivers,
  fleets,
  fleetMembers,
  fleetVehicleAssignments,
  users,
  vehicles,
} from "../src/db/schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 200;

async function backfillBatch(): Promise<number> {
  const rows = await db
    .select({
      id: drivers.id,
      user_id: drivers.user_id,
      driver_name: users.name,
    })
    .from(drivers)
    .leftJoin(users, eq(users.id, drivers.user_id))
    .where(isNull(drivers.fleet_id))
    .orderBy(asc(drivers.id))
    .limit(BATCH_SIZE);

  let processed = 0;
  for (const driver of rows) {
    const displayName = driver.driver_name?.trim() || "Driver";
    const fleetName = `${displayName} Fleet`;

    if (DRY_RUN) {
      logger.info(`[fleet-backfill] (dry-run) would create solo fleet for driver ${driver.id}: "${fleetName}"`);
      processed++;
      continue;
    }

    await db.transaction(async (tx) => {
      const [fleet] = await tx
        .insert(fleets)
        .values({
          owner_user_id: driver.user_id,
          name: fleetName,
          fleet_type: "NATIVE",
          status: "ACTIVE",
        })
        .returning({ id: fleets.id });

      await tx.insert(fleetMembers).values({
        fleet_id: fleet.id,
        user_id: driver.user_id,
        role: "OWNER",
        status: "active",
      });

      await tx
        .update(drivers)
        .set({ fleet_id: fleet.id, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));

      // Link the existing 1:1 vehicle, if the driver has registered one yet.
      const [vehicle] = await tx
        .select({ id: vehicles.id, created_at: vehicles.created_at })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driver.id))
        .limit(1);

      if (vehicle) {
        await tx
          .update(vehicles)
          .set({ fleet_id: fleet.id, updated_at: new Date() })
          .where(eq(vehicles.id, vehicle.id));

        await tx.insert(fleetVehicleAssignments).values({
          fleet_id: fleet.id,
          vehicle_id: vehicle.id,
          driver_id: driver.id,
          assigned_at: vehicle.created_at ?? new Date(),
          status: "active",
        });
      }
    });
    processed++;
  }
  return processed;
}

async function verifyCoverage(): Promise<{
  driversMissing: number;
  vehiclesMissing: number;
  totalDrivers: number;
  totalVehicles: number;
}> {
  const [{ count: totalDrivers }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(drivers);
  const [{ count: driversMissing }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(drivers)
    .where(isNull(drivers.fleet_id));
  const [{ count: totalVehicles }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vehicles);
  const [{ count: vehiclesMissing }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vehicles)
    .where(isNull(vehicles.fleet_id));
  return { driversMissing, vehiclesMissing, totalDrivers, totalVehicles };
}

async function main(): Promise<void> {
  logger.info(`[fleet-backfill] start (dry-run=${DRY_RUN})`);

  let total = 0;
  // Loop until a batch returns zero rows (drivers not yet backfilled).
  for (let i = 0; i < 10_000; i++) {
    const processed = await backfillBatch();
    total += processed;
    if (processed < BATCH_SIZE) break;
  }
  logger.info(`[fleet-backfill] processed ${total} drivers`);

  const coverage = await verifyCoverage();
  logger.info(
    `[fleet-backfill] coverage: drivers ${coverage.totalDrivers - coverage.driversMissing}/${coverage.totalDrivers}, vehicles ${coverage.totalVehicles - coverage.vehiclesMissing}/${coverage.totalVehicles}`,
  );

  if (coverage.driversMissing > 0 || coverage.vehiclesMissing > 0) {
    logger.error(
      `[fleet-backfill] INCOMPLETE coverage — NOT NULL NOT applied. drivers missing=${coverage.driversMissing}, vehicles missing=${coverage.vehiclesMissing}. Re-run after resolving.`,
    );
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    logger.info("[fleet-backfill] dry-run complete — NOT NULL not applied");
    return;
  }

  // 100% coverage verified — apply the NOT NULL constraints (spec
  // §backfill_procedure step 7). NOTE: the ALTER statements here have shown
  // flaky persistence on the Supabase pooler — always verify afterwards with
  // `npx tsx scripts/verify-fleet-schema.ts` and, if still nullable, enforce
  // with `npx tsx scripts/verify-fleet-schema.ts --enforce-notnull`.
  await db.execute(sql`ALTER TABLE drivers ALTER COLUMN fleet_id SET NOT NULL`);
  await db.execute(sql`ALTER TABLE vehicles ALTER COLUMN fleet_id SET NOT NULL`);
  logger.info(
    "[fleet-backfill] NOT NULL applied to drivers.fleet_id and vehicles.fleet_id. " +
      "NOW flip schema.ts to .notNull() for both columns to keep the schema in sync.",
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    logger.error("[fleet-backfill] fatal", { error: String(err) });
    process.exit(1);
  });
