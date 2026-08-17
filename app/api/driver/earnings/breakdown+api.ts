import { db } from "@/src/db";
import { rides, users, drivers } from "@/src/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  bdtDayBoundariesUtc,
  bdtMonthStartUtc,
  prevBdtMidnightUtc,
} from "@/lib/time";
import * as errors from "@/lib/errors";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const range = url.searchParams.get("range") ?? "week";

    // All periods are Asia/Dhaka calendar windows — a UTC-midnight "today"
    // would show the wrong day for 6 hours every day (previously a latent bug).
    let periodStart: Date;
    let periodEnd: Date = new Date();
    let dateKey: string | null = null;

    if (dateParam) {
      const boundaries = bdtDayBoundariesUtc(dateParam);
      if (!boundaries) {
        return Response.json({ error: 'invalid_date', message: 'Date must be YYYY-MM-DD' }, { status: 400 });
      }
      periodStart = boundaries.start;
      periodEnd = boundaries.end;
      dateKey = dateParam;
    } else if (range === "today") {
      periodStart = prevBdtMidnightUtc();
    } else if (range === "month") {
      periodStart = bdtMonthStartUtc();
    } else {
      // "week": the last 7 Dhaka days, today included.
      periodStart = new Date(prevBdtMidnightUtc().getTime() - 6 * DAY_MS);
    }

    const tripRows = await db.select({
      ride_id: rides.id,
      completed_at: rides.completed_at,
      totalBdt: sql<string>`COALESCE(CAST(fare_breakdown->>'total_bdt' AS bigint), 0)`,
      driverFareBdt: rides.driver_fare_bdt,
      commissionBdt: rides.platform_commission_bdt,
      distance_km: rides.distance_km,
      origin_address: rides.origin_address,
      destination_address: rides.destination_address,
    })
      .from(rides)
      .where(
        dateKey
          ? and(
              eq(rides.driver_id, driver.id),
              eq(rides.status, "completed"),
              gte(rides.completed_at, periodStart),
              lt(rides.completed_at, periodEnd),
            )
          : and(
              eq(rides.driver_id, driver.id),
              eq(rides.status, "completed"),
              gte(rides.completed_at, periodStart),
            )
      )
      .orderBy(sql`completed_at DESC`)
      .limit(200);

    const trips = tripRows.map((r) => {
      const totalBdt = Number(r.totalBdt ?? 0);
      const driverFare = r.driverFareBdt ?? (totalBdt - (r.commissionBdt ?? 0));
      return {
        ride_id: r.ride_id,
        completed_at: r.completed_at?.toISOString() ?? "",
        fare_bdt: totalBdt,
        driver_fare_bdt: driverFare,
        distance_km: parseFloat(String(r.distance_km ?? "0")),
        origin_address: r.origin_address,
        destination_address: r.destination_address,
      };
    });

    const totalEarningsBdt = trips.reduce((acc, t) => acc + t.driver_fare_bdt, 0);

    return Response.json({
      range: dateKey ? "date" : range,
      date: dateKey,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_earnings_bdt: totalEarningsBdt,
      total_trips: trips.length,
      trips,
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/earnings/breakdown] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
