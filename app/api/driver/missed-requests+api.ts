import { db } from '@/src/db';
import { dispatchOffers, drivers, users, rides } from '@/src/db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const querySchema = z.object({
  outcome: z.enum(['accepted', 'expired', 'refunded', 'filtered', 'delivered']).optional(),
  vehicle_type: z.string().optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      outcome: url.searchParams.get('outcome') ?? undefined,
      vehicle_type: url.searchParams.get('vehicle_type') ?? undefined,
      from_date: url.searchParams.get('from_date') ?? undefined,
      to_date: url.searchParams.get('to_date') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { outcome, vehicle_type, from_date, to_date, limit, offset } = parsed.data;

    // Build filter conditions
    const conditions = [eq(dispatchOffers.driver_id, driver.id)];
    if (outcome) {
      conditions.push(eq(dispatchOffers.outcome, outcome as any));
    }
    if (from_date) {
      conditions.push(gte(dispatchOffers.sent_at, new Date(from_date)));
    }
    if (to_date) {
      conditions.push(lte(dispatchOffers.sent_at, new Date(to_date)));
    }

    // For vehicle_type filter, we need to join with rides
    let vehicleFilter = false;
    if (vehicle_type) {
      vehicleFilter = true;
    }

    // Fetch offers with optional ride join for vehicle_type
    const offerRows = await db.select({
      id: dispatchOffers.id,
      ride_id: dispatchOffers.ride_id,
      batch_index: dispatchOffers.batch_index,
      sent_at: dispatchOffers.sent_at,
      fetch_confirmed_at: dispatchOffers.fetch_confirmed_at,
      responded_at: dispatchOffers.responded_at,
      outcome: dispatchOffers.outcome,
      rejection_reason: dispatchOffers.rejection_reason,
      filtered_reason: dispatchOffers.filtered_reason,
      ride_vehicle_type: rides.vehicle_type,
      ride_pickup_address: rides.origin_address,
      ride_dropoff_address: rides.destination_address,
      ride_distance_km: rides.distance_km,
    })
      .from(dispatchOffers)
      .leftJoin(rides, eq(dispatchOffers.ride_id, rides.id))
      .where(and(...conditions))
      .orderBy(desc(dispatchOffers.sent_at))
      .limit(limit)
      .offset(offset);

    // Apply vehicle_type filter in-memory if needed (since it's from the joined table)
    const filteredRows = vehicleFilter
      ? offerRows.filter(row => row.ride_vehicle_type === vehicle_type)
      : offerRows;

    // Summary stats: count by outcome for the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    const summaryRows = await db.select({
      outcome: dispatchOffers.outcome,
      count: sql<number>`count(*)`,
    })
      .from(dispatchOffers)
      .where(and(
        eq(dispatchOffers.driver_id, driver.id),
        gte(dispatchOffers.sent_at, weekAgo),
      ))
      .groupBy(dispatchOffers.outcome);

    const summary: Record<string, number> = {
      accepted: 0,
      expired: 0,
      refunded: 0,
      filtered: 0,
      delivered: 0,
    };
    for (const row of summaryRows) {
      summary[row.outcome] = Number(row.count);
    }

    // Count filtered (min_per_km) from the last 7 days
    const [filteredCount] = await db.select({ count: sql<number>`count(*)` })
      .from(dispatchOffers)
      .where(and(
        eq(dispatchOffers.driver_id, driver.id),
        eq(dispatchOffers.outcome, 'filtered'),
        gte(dispatchOffers.sent_at, weekAgo),
      ));

    return Response.json({
      offers: filteredRows.map(row => ({
        id: row.id,
        ride_id: row.ride_id,
        batch_index: row.batch_index,
        sent_at: row.sent_at,
        fetch_confirmed_at: row.fetch_confirmed_at,
        responded_at: row.responded_at,
        outcome: row.outcome,
        rejection_reason: row.rejection_reason,
        filtered_reason: row.filtered_reason,
        vehicle_type: row.ride_vehicle_type,
        pickup_address: row.ride_pickup_address,
        dropoff_address: row.ride_dropoff_address,
        distance_km: row.ride_distance_km ? Number(row.ride_distance_km) : null,
      })),
      summary: {
        accepted: summary.accepted ?? 0,
        expired: summary.expired ?? 0,
        refunded: summary.refunded ?? 0,
        filtered: summary.filtered ?? 0,
        filtered_by_min_rate: Number(filteredCount?.count ?? 0),
      },
      pagination: {
        limit,
        offset,
        has_more: filteredRows.length === limit,
      },
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/missed-requests] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
