/**
 * GET /api/fleet/finance?fleet_id=...
 *
 * Fleet finance reporting — reads from rides table via drivers.fleet_id join.
 * Returns aggregated metrics for today, this week, this month, and all-time:
 *   - trip_count: completed rides
 *   - gross_fare_bdt: sum of rider_payable_bdt (integer paisa)
 *   - platform_commission_bdt: sum of platform_commission_bdt
 *   - driver_payout_bdt: sum of driver_fare_bdt
 *   - fleet_revenue_bdt: gross_fare - platform_commission
 *   - avg_fare_bdt: average fare per completed ride
 *   - cancelled_count: rides with status 'cancelled'
 *   - total_distance_km: sum of distance_km
 *
 * All money fields are integer paisa — divide by 100 only at UI display.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import { drivers, rides } from "@/src/db/schema";
import { and, eq, gte, sql, count, sum } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

// ── Period helpers ───────────────────────────────────────────────────────

function bdtMidnightUtc(date: Date): Date {
  // Asia/Dhaka = UTC+6. Midnight BDT = 18:00 UTC previous day.
  const d = new Date(date);
  d.setUTCHours(18, 0, 0, 0);
  if (d > date) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function weekStartUtc(date: Date): Date {
  const midnight = bdtMidnightUtc(date);
  const day = midnight.getUTCDay(); // 0=Sun
  midnight.setUTCDate(midnight.getUTCDate() - day);
  return midnight;
}

function monthStartUtc(date: Date): Date {
  const midnight = bdtMidnightUtc(date);
  midnight.setUTCDate(1);
  return midnight;
}

// ── Aggregation query ────────────────────────────────────────────────────

async function aggregateRides(
  fleetId: string,
  since: Date,
): Promise<{
  trip_count: number;
  gross_fare_bdt: number;
  platform_commission_bdt: number;
  driver_payout_bdt: number;
  fleet_revenue_bdt: number;
  avg_fare_bdt: number;
  cancelled_count: number;
  total_distance_km: number;
}> {
  const fleetDriverIds = db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.fleet_id, fleetId));

  const [result] = await db
    .select({
      trip_count: count(),
      gross_fare: sql<number>`coalesce(sum(${rides.rider_payable_bdt}), 0)::int`,
      platform_commission: sql<number>`coalesce(sum(${rides.platform_commission_bdt}), 0)::int`,
      driver_payout: sql<number>`coalesce(sum(${rides.driver_fare_bdt}), 0)::int`,
      cancelled_count: sql<number>`count(*) filter (where ${rides.status} = 'cancelled')::int`,
      total_distance: sql<number>`coalesce(sum(${rides.distance_km}), 0)::numeric`,
    })
    .from(rides)
    .where(
      and(
        sql`${rides.driver_id} in (select id from ${fleetDriverIds})`,
        eq(rides.status, "completed"),
        gte(rides.completed_at, since),
      ),
    );

  const gross = result?.gross_fare ?? 0;
  const commission = result?.platform_commission ?? 0;
  const tripCount = result?.trip_count ?? 0;

  return {
    trip_count: tripCount,
    gross_fare_bdt: gross,
    platform_commission_bdt: commission,
    driver_payout_bdt: result?.driver_payout ?? 0,
    fleet_revenue_bdt: gross - commission,
    avg_fare_bdt: tripCount > 0 ? Math.round(gross / tripCount) : 0,
    cancelled_count: result?.cancelled_count ?? 0,
    total_distance_km: Number(result?.total_distance ?? 0),
  };
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsed.data.fleet_id;

    await requireFleetMember(fleetId)(request);

    const now = new Date();

    // Parallel aggregations for all periods.
    const [today, thisWeek, thisMonth, allTime] = await Promise.all([
      aggregateRides(fleetId, bdtMidnightUtc(now)),
      aggregateRides(fleetId, weekStartUtc(now)),
      aggregateRides(fleetId, monthStartUtc(now)),
      aggregateRides(fleetId, new Date(0)), // epoch = all time
    ]);

    return Response.json(
      {
        today,
        this_week: thisWeek,
        this_month: thisMonth,
        all_time: allTime,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    if (status === 403) {
      return Response.json(
        { error: "forbidden", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }
    logger.error("[fleet/finance] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
