import { db } from "../src/db";
import { zones, rides, drivers, demandForecasts } from "../src/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Z-6: Hourly demand forecast upsert.
 *
 * For each active zone:
 *   1. predicted_demand = mean rides created in the same hour-of-day over
 *      the trailing 7 days (source: rides.zone_id + created_at).
 *   2. predicted_supply  = current online drivers in zone (post-Z-4 stamps).
 *   3. confidence_score  = 0.50 (v1 constant — improves with data volume).
 *   4. forecast_hour     = next full hour (Dhaka time, UTC).
 *
 * Uses onConflictDoUpdate for idempotent upserts keyed on (zone_id, forecast_hour).
 * Prunes rows older than 14 days.
 */
const BDT_OFFSET_MS = 6 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const CONFIDENCE_V1 = "0.50";

/** Next full hour in Asia/Dhaka, expressed as a UTC timestamp. */
function nextBdtHourUtc(now: Date = new Date()): Date {
  const bdt = new Date(now.getTime() + BDT_OFFSET_MS);
  const nextHour = new Date(
    Date.UTC(bdt.getUTCFullYear(), bdt.getUTCMonth(), bdt.getUTCDate(), bdt.getUTCHours() + 1),
  );
  return new Date(nextHour.getTime() - BDT_OFFSET_MS);
}

/**
 * Compute the hour-of-day (0–23) in Asia/Dhaka for a given UTC timestamp.
 */
function bdtHourOfDay(d: Date): number {
  return (d.getUTCHours() + 6) % 24;
}

/**
 * Compute the hour-of-day range to query for historical demand.
 * We look at rides created in the same BDT hour-of-day over the trailing 7 days.
 */
async function computeDemandForZone(
  zoneId: string,
  targetBdtHour: number,
): Promise<number> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  // rides.created_at is UTC. We need rides where the BDT hour-of-day
  // matches targetBdtHour. Since BDT = UTC+6, BDT hour H = UTC hour (H-6+24)%24.
  // We query the equivalent UTC hours that map to this BDT hour.
  const utcHour = (targetBdtHour - 6 + 24) % 24;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rides)
    .where(
      and(
        eq(rides.zone_id, zoneId),
        gte(rides.created_at, since),
        sql`EXTRACT(HOUR FROM ${rides.created_at} AT TIME ZONE 'UTC') = ${utcHour}`,
      ),
    );

  // Average over 7 days
  const totalCount = Number(count ?? 0);
  return Math.round(totalCount / 7);
}

/** Count online drivers in a zone. */
async function computeSupplyForZone(zoneId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(drivers)
    .where(
      and(
        eq(drivers.zone_id, zoneId),
        eq(drivers.is_online, true),
        eq(drivers.status, 'active'),
      ),
    );

  return Number(count ?? 0);
}

/**
 * Main entry point: upsert forecasts for all active zones.
 * Called by the scheduler every hour.
 */
export async function upsertDemandForecasts(): Promise<void> {
  const forecastHour = nextBdtHourUtc();

  const activeZones = await db
    .select({ id: zones.id, name: zones.name })
    .from(zones)
    .where(eq(zones.is_active, true));

  if (activeZones.length === 0) {
    logger.debug("[forecast] no active zones — skipping forecast upsert");
    return;
  }

  const targetBdtHour = bdtHourOfDay(forecastHour);

  let upserted = 0;
  for (const zone of activeZones) {
    try {
      const [demand, supply] = await Promise.all([
        computeDemandForZone(zone.id, targetBdtHour),
        computeSupplyForZone(zone.id),
      ]);

      await db
        .insert(demandForecasts)
        .values({
          zone_id: zone.id,
          forecast_hour: forecastHour,
          predicted_demand: demand,
          predicted_supply: supply,
          confidence_score: CONFIDENCE_V1,
        })
        .onConflictDoUpdate({
          target: [demandForecasts.zone_id, demandForecasts.forecast_hour],
          set: {
            predicted_demand: demand,
            predicted_supply: supply,
            confidence_score: CONFIDENCE_V1,
          },
        });

      upserted++;
    } catch (e) {
      logger.error("[forecast] zone forecast upsert failed", {
        zoneId: zone.id,
        zoneName: zone.name,
        error: e,
      });
    }
  }

  // Prune rows older than 14 days
  const pruneBefore = new Date(Date.now() - FOURTEEN_DAYS_MS);
  const pruned = await db
    .delete(demandForecasts)
    .where(sql`${demandForecasts.forecast_hour} < ${pruneBefore.toISOString()}`);

  logger.info("[forecast] demand forecast upsert completed", {
    zonesProcessed: activeZones.length,
    upserted,
    pruned: pruned.length,
    forecastHour: forecastHour.toISOString(),
  });
}
