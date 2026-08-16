import { db } from '@/src/db';
import { rides, users, drivers } from '@/src/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  role: z.enum(['rider', 'driver']),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const user = await verifySupabaseToken(request);

    if (!z.string().uuid().safeParse(id).success) return Response.json({ error: 'invalid_ride_id', message: 'Invalid ride ID' }, { status: 400 });

    const body = await parseJsonBody(request, rateSchema);
    if (!body.ok) return body.response;
    const { rating, role } = body.data;

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (ride.status !== 'completed') {
      return Response.json({ error: 'ride_not_completed', message: `Ride status is ${ride.status}` }, { status: 422 });
    }

    if (role === 'rider') {
      if (ride.user_id !== dbUser.id) {
        return Response.json({ error: 'not_participant', message: 'You are not a participant in this ride' }, { status: 403 });
      }
      if (ride.rider_rating !== null) {
        return Response.json({ error: 'already_rated', message: 'Ride already rated' }, { status: 409 });
      }

      await db.transaction(async (tx) => {
        // M-4: atomic claim — concurrent double-rates both pass the JS check
        // above; only one wins the rider_rating IS NULL claim, so rating_sum /
        // rating_count can't double-increment for one ride.
        const [claimed] = await tx.update(rides)
          .set({ rider_rating: rating })
          .where(and(eq(rides.id, id), isNull(rides.rider_rating)))
          .returning({ id: rides.id });
        if (!claimed) throw Object.assign(new Error('already_rated'), { status: 409 });
        if (ride.driver_id) {
          await tx.update(drivers).set({
            rating_sum: sql`${drivers.rating_sum} + ${rating}`,
            rating_count: sql`${drivers.rating_count} + 1`,
            rating: sql`((${drivers.rating_sum} + ${rating})::numeric / (${drivers.rating_count} + 1))`,
          }).where(eq(drivers.id, ride.driver_id));
        }
      });
    } else {
      const [driver] = await db.select({ id: drivers.id })
        .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
      if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

      if (ride.driver_id !== driver.id) {
        return Response.json({ error: 'not_participant', message: 'You are not a participant in this ride' }, { status: 403 });
      }
      if (ride.driver_rating !== null) {
        return Response.json({ error: 'already_rated', message: 'Ride already rated' }, { status: 409 });
      }

      await db.transaction(async (tx) => {
        const [claimed] = await tx.update(rides)
          .set({ driver_rating: rating })
          .where(and(eq(rides.id, id), isNull(rides.driver_rating)))
          .returning({ id: rides.id });
        if (!claimed) throw Object.assign(new Error('already_rated'), { status: 409 });
        await tx.update(users).set({
          rating_sum: sql`${users.rating_sum} + ${rating}`,
          rating_count: sql`${users.rating_count} + 1`,
          rating: sql`((${users.rating_sum} + ${rating})::numeric / (${users.rating_count} + 1))`,
        }).where(eq(users.id, ride.user_id));
      });
    }

    logger.info('[ride/rate] rating submitted', { rideId: id, role, rating });
    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (err.status === 409) return Response.json({ error: 'already_rated', message: 'Ride already rated' }, { status: 409 });
    logger.error('[ride/rate] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
