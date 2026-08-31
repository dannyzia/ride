import { db } from '@/src/db';
import { drivers, driverOnlineSessions, rides, users } from '@/src/db/schema';
import { eq, and, gte, lt, or, isNull, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { nextBdtMidnightUtc, prevBdtMidnightUtc, bdtDayBoundariesUtc } from '@/lib/time';
import * as errors from '@/lib/errors';

interface DayAggregate {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
}

/**
 * Aggregate a driver's earnings/trips/online hours over one Dhaka-day window
 * [windowStart, windowEnd). Shared by the today endpoint and the
 * earnings-detail day drilldown (?date=YYYY-MM-DD).
 */
async function getDriverDailyStats(
  driverId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<DayAggregate> {
  const [rideAgg] = await db.select({
    // Driver take = fare + tips (tip_bdt is recorded separately on the ride).
    earnings_bdt: sql<number | null>`COALESCE(SUM(${rides.driver_fare_bdt}), 0) + COALESCE(SUM(${rides.tip_bdt}), 0)`,
    trips: sql<number>`COUNT(*)`,
  })
    .from(rides)
    .where(and(
      eq(rides.driver_id, driverId),
      eq(rides.status, 'completed'),
      gte(rides.completed_at, windowStart),
      lt(rides.completed_at, windowEnd),
    ));

  // Sum of online-session durations clipped to the window.
  // Active sessions (went_offline_at NULL) count up to now().
  // Window bounds are interpolated as ISO strings with an explicit
  // ::timestamptz cast: drizzle maps Date only through typed column
  // comparisons (gte/lt), not raw sql-template params — a raw Date reaches
  // postgres.js's Bind as an untyped param and throws
  // "The \"string\" argument must be of type string… Received an instance of
  // Date" (verified by tmp diagnostic 2026-08-29).
  const [sessionAgg] = await db.select({
    online_hours: sql<string | null>`COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(${driverOnlineSessions.went_offline_at}, NOW()), ${windowEnd.toISOString()}::timestamptz) - GREATEST(${driverOnlineSessions.went_online_at}, ${windowStart.toISOString()}::timestamptz)))) / 3600.0), 0)`,
  })
    .from(driverOnlineSessions)
    .where(and(
      eq(driverOnlineSessions.driver_id, driverId),
      lt(driverOnlineSessions.went_online_at, windowEnd),
      or(isNull(driverOnlineSessions.went_offline_at), gte(driverOnlineSessions.went_offline_at, windowStart)),
    ));

  return {
    earnings_bdt: Number(rideAgg?.earnings_bdt ?? 0),
    trips: Number(rideAgg?.trips ?? 0),
    online_hours: Math.round(Number(sessionAgg?.online_hours ?? 0) * 100) / 100,
  };
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({
      id: drivers.id,
      rating: drivers.rating,
      acceptance_rate: drivers.acceptance_rate,
    }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // Optional ?date=YYYY-MM-DD (Asia/Dhaka day) — used by the earnings-detail
    // drilldown. Absent = today in Dhaka time: [previous BDT midnight, next BDT
    // midnight). Computing the previous boundary from the calendar (not
    // windowEnd − 24h) keeps the math correct even if a zone ever adopts DST.
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');

    let windowStart: Date;
    let windowEnd: Date;
    if (dateParam) {
      const boundaries = bdtDayBoundariesUtc(dateParam);
      if (!boundaries) {
        return Response.json({ error: 'invalid_date', message: 'Date must be YYYY-MM-DD' }, { status: 400 });
      }
      windowStart = boundaries.start;
      windowEnd = boundaries.end;
    } else {
      windowStart = prevBdtMidnightUtc();
      windowEnd = nextBdtMidnightUtc();
    }

    const stats = await getDriverDailyStats(driver.id, windowStart, windowEnd);

    return Response.json({
      earnings_bdt: stats.earnings_bdt,
      trips: stats.trips,
      online_hours: stats.online_hours,
      rating: driver.rating != null ? Number(driver.rating) : null,
      acceptance_rate: driver.acceptance_rate != null ? Number(driver.acceptance_rate) : null,
      date: dateParam ?? undefined,
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/daily-stats] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
