// Auth: verifySupabaseToken via Bearer token
import { db } from "@/src/db";
import { eq, desc } from "drizzle-orm";
import { rides, users, drivers } from "@/src/db/schema";
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const allRides = await db
      .select({
        ride_id: rides.id,
        origin_address: rides.origin_address,
        destination_address: rides.destination_address,
        origin_latitude: rides.origin_latitude,
        origin_longitude: rides.origin_longitude,
        destination_latitude: rides.destination_latitude,
        destination_longitude: rides.destination_longitude,
        fare_breakdown: rides.fare_breakdown,
        driver_id: rides.driver_id,
        user_id: rides.user_id,
        created_at: rides.created_at,
        status: rides.status,
        scheduled_at: rides.scheduled_at,
        completed_at: rides.completed_at,
        vehicle_type: rides.vehicle_type,
        cancel_reason: rides.cancel_reason,
        cancelled_by: rides.cancelled_by,
        driver: {
          driver_id: drivers.id,
          full_name: users.name,
          profile_image_url: users.profile_image_url,
          rating: drivers.rating,
        },
      })
      .from(rides)
      .innerJoin(users, eq(rides.user_id, users.id))
      .leftJoin(drivers, eq(rides.driver_id, drivers.id))
      .where(eq(users.auth_uid, user.id))
      .orderBy(desc(rides.created_at));

    return Response.json({ data: allRides }, { status: 200 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[ride/get-all] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
