import { db } from '@/src/db';
import { drivers, driverOnlineSessions, rides, users } from '@/src/db/schema';
import { eq, and, gte, lt, or, isNull, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { nextBdtMidnightUtc, prevBdtMidnightUtc } from '@/lib/time';

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

    // Today in Dhaka time: [previous BDT midnight UTC, next BDT midnight UTC).
    // Computing the previous boundary from the calendar (not windowEnd − 24h)
    // keeps the math correct even if a zone ever adopts DST.
    const windowEnd = nextBdtMidnightUtc();
    const windowStart = prevBdtMidnightUtc();

    const [rideAgg] = await db.select({
      // Driver take = fare + tips (tip_bdt is recorded separately on the ride).
      earnings_bdt: sql<number | null>`COALESCE(SUM(${rides.driver_fare_bdt}), 0) + COALESCE(SUM(${rides.tip_bdt}), 0)`,
      trips: sql<number>`COUNT(*)`,
    })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, 'completed'),
        gte(rides.completed_at, windowStart),
        lt(rides.completed_at, windowEnd),
      ));

    // Sum of online-session durations clipped to today's window.
    // Active sessions (went_offline_at NULL) count up to now().
    const [sessionAgg] = await db.select({
      online_hours: sql<string | null>`COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(${driverOnlineSessions.went_offline_at}, NOW()), ${windowEnd}) - GREATEST(${driverOnlineSessions.went_online_at}, ${windowStart})))) / 3600.0), 0)`,
    })
      .from(driverOnlineSessions)
      .where(and(
        eq(driverOnlineSessions.driver_id, driver.id),
        lt(driverOnlineSessions.went_online_at, windowEnd),
        or(isNull(driverOnlineSessions.went_offline_at), gte(driverOnlineSessions.went_offline_at, windowStart)),
      ));

    return Response.json({
      earnings_bdt: Number(rideAgg?.earnings_bdt ?? 0),
      trips: Number(rideAgg?.trips ?? 0),
      online_hours: Math.round(Number(sessionAgg?.online_hours ?? 0) * 100) / 100,
      rating: driver.rating != null ? Number(driver.rating) : null,
      acceptance_rate: driver.acceptance_rate != null ? Number(driver.acceptance_rate) : null,
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/daily-stats] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
