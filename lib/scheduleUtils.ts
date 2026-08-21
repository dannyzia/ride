import { db } from '@/src/db';
import { rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { computeEtaMinutes, etaSpeedKmh, timeBucket } from '@/lib/eta';

/**
 * Default average speed (km/h) used when the ETA module's speed table
 * is unavailable. 25 km/h is a conservative urban Dhaka estimate that
 * aligns with the DEFAULT_SPEED_TABLE off-peak bike value.
 */
const FALLBACK_SPEED_KMH = 25;

/**
 * Compute estimated ride duration in minutes from distance and vehicle type.
 *
 * Uses the same ETA speed table as the estimate endpoint so the overlap
 * window is consistent with what the client displays. When the scheduled
 * time is provided, peak/offpeak/night bucket is computed from it; otherwise
 * defaults to offpeak.
 *
 * @param distanceKm - total route distance in km (already includes multi-leg)
 * @param vehicleType - e.g. 'bike_basic', 'car_economy'
 * @param scheduledAt - optional Date; if provided, speed bucket is derived from it
 * @returns estimated duration in minutes (minimum 1)
 */
export function computeEstimatedDurationMinutes(
  distanceKm: number,
  vehicleType: string,
  scheduledAt?: Date,
): number {
  const bucket = scheduledAt ? timeBucket(scheduledAt) : 'offpeak';
  const speed = etaSpeedKmh(vehicleType, bucket);
  return computeEtaMinutes(distanceKm, speed || FALLBACK_SPEED_KMH);
}

export interface OverlapCheckResult {
  /** true if an overlap was found */
  overlap: boolean;
  /** the conflicting ride's id, if any */
  conflict_ride_id?: string;
}

/**
 * Check whether a new scheduled ride's time window overlaps with any of the
 * rider's existing scheduled rides.
 *
 * Two windows overlap when: existingStart < newEnd AND existingEnd > newStart
 * (strict < on both sides means back-to-back rides with no gap do NOT count
 * as overlapping — ride A ending exactly when ride B starts is fine).
 *
 * For each existing scheduled ride, the end time is computed as:
 *   scheduled_at + computeEstimatedDurationMinutes(distance_km, vehicle_type, scheduled_at)
 *
 * This uses the same ETA speed table as the estimate endpoint so the
 * overlap window is consistent with what the client displays.
 *
 * @param userId - the rider's users.id
 * @param newStart - the scheduled_at of the proposed ride
 * @param newEnd - scheduled_at + estimated_duration for the new ride
 * @param excludeRideId - optional ride id to exclude (for reschedules)
 */
export async function checkRideOverlap(
  userId: string,
  newStart: Date,
  newEnd: Date,
  excludeRideId?: string,
): Promise<OverlapCheckResult> {
  // Query only scheduled rides for this user (uses rides_user_status_idx)
  const candidates = await db
    .select({
      id: rides.id,
      status: rides.status,
      scheduled_at: rides.scheduled_at,
      distance_km: rides.distance_km,
      vehicle_type: rides.vehicle_type,
    })
    .from(rides)
    .where(eq(rides.user_id, userId));

  for (const row of candidates) {
    // Only check scheduled rides
    if (row.status !== 'scheduled') continue;
    // Skip the ride being rescheduled
    if (excludeRideId && row.id === excludeRideId) continue;

    const existingStart = row.scheduled_at;
    if (!existingStart) continue;

    const distanceKm = Number(row.distance_km) || 0;
    const durationMin = computeEstimatedDurationMinutes(
      distanceKm,
      row.vehicle_type,
      existingStart,
    );
    const existingEnd = new Date(existingStart.getTime() + durationMin * 60 * 1000);

    // Overlap: existingStart < newEnd AND existingEnd > newStart
    if (existingStart < newEnd && existingEnd > newStart) {
      return { overlap: true, conflict_ride_id: row.id };
    }
  }

  return { overlap: false };
}
