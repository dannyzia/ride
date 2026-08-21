import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { computeEstimatedDurationMinutes } from '@/lib/scheduleUtils';
import * as errors from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * GET /api/ride/schedule/overlap?scheduled_at=<ISO8601>
 *
 * Client-side overlap guard. Returns { conflict: true, message } if the
 * requested time overlaps with an existing scheduled ride, or
 * { conflict: false } otherwise.
 *
 * The server's POST /api/ride/schedule is the authoritative guard (advisory
 * lock + overlap check inside the transaction). This endpoint exists so the
 * ScheduleRideSheet can show immediate feedback before the user submits.
 */
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) {
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    }
    if (user.role !== 'rider') {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    const url = new URL(request.url);
    const scheduledAtStr = url.searchParams.get('scheduled_at');
    if (!scheduledAtStr) {
      return Response.json({ error: 'missing_param', message: 'scheduled_at is required' }, { status: 400 });
    }

    const newStart = new Date(scheduledAtStr);
    if (isNaN(newStart.getTime())) {
      return Response.json({ error: 'invalid_param', message: 'scheduled_at must be a valid ISO 8601 date' }, { status: 400 });
    }

    // Fetch all scheduled rides for this rider
    const scheduledRides = await db
      .select({
        id: rides.id,
        status: rides.status,
        scheduled_at: rides.scheduled_at,
        distance_km: rides.distance_km,
        vehicle_type: rides.vehicle_type,
      })
      .from(rides)
      .where(eq(rides.user_id, user.id));

    // Check each scheduled ride for overlap
    for (const ride of scheduledRides) {
      if (ride.status !== 'scheduled') continue;
      const existingStart = ride.scheduled_at;
      if (!existingStart) continue;

      const distanceKm = Number(ride.distance_km) || 0;
      const durationMin = computeEstimatedDurationMinutes(
        distanceKm,
        ride.vehicle_type,
        existingStart,
      );
      const existingEnd = new Date(existingStart.getTime() + durationMin * 60 * 1000);

      // Use a conservative estimate for the new ride (60 min default)
      // since we don't have distance info at this point
      const NEW_RIDE_DEFAULT_MINUTES = 60;
      const newEnd = new Date(newStart.getTime() + NEW_RIDE_DEFAULT_MINUTES * 60 * 1000);

      // Overlap: existingStart < newEnd AND existingEnd > newStart
      if (existingStart < newEnd && existingEnd > newStart) {
        return Response.json({
          conflict: true,
          message: 'This time overlaps with another scheduled ride',
          conflict_ride_id: ride.id,
        });
      }
    }

    return Response.json({ conflict: false });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    logger.error('[ride/schedule/overlap] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
