import { db } from '@/src/db';
import { rides, drivers, safetyAnomalies } from '@/src/db/schema';
import { eq, and, sql, lte } from 'drizzle-orm';
import { logger } from '@/lib/logger';

// Route deviation detection — called from location handler
export async function detectRouteDeviation(
  rideId: string, currentLat: number, currentLng: number,
  expectedLat: number, expectedLng: number, thresholdMeters = 500,
): Promise<void> {
  try {
    const deviation = Math.sqrt((currentLat - expectedLat) ** 2 + (currentLng - expectedLng) ** 2) * 111320;
    if (deviation > thresholdMeters) {
      await db.insert(safetyAnomalies).values({
        ride_id: rideId, anomaly_type: 'route_deviation', severity: 'medium',
        description: `Deviation: ${Math.round(deviation)}m from expected location`,
      });
      logger.warn('[safety] route deviation detected', { rideId, deviationMeters: Math.round(deviation) });
    }
  } catch (e) { logger.error('[safety] detectRouteDeviation error', e); }
}

// Stationary anomaly — called from scheduler (5-min job)
export async function detectStationaryAnomaly(): Promise<void> {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stuckRides = await db.select({ id: rides.id, driver_id: rides.driver_id }).from(rides)
      .where(and(eq(rides.status, 'in_progress'), lte(rides.updated_at, fiveMinAgo)));
    for (const ride of stuckRides) {
      await db.insert(safetyAnomalies).values({
        ride_id: ride.id, driver_id: ride.driver_id, anomaly_type: 'stationary_long', severity: 'low',
        description: 'Vehicle stationary for 5+ minutes during active ride',
      });
    }
  } catch (e) { logger.error('[safety] detectStationaryAnomaly error', e); }
}

// Night ride protocol check
export async function checkNightRideProtocol(rideId: string, driverId: string): Promise<void> {
  try {
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 5) {
      await db.insert(safetyAnomalies).values({
        ride_id: rideId, driver_id: driverId, anomaly_type: 'night_ride_no_check', severity: 'low',
        description: 'Night ride started without safety check',
      });
    }
  } catch (e) { logger.error('[safety] checkNightRideProtocol error', e); }
}
