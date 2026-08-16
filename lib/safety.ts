import { db } from "../src/db";
import { rides, safetyAnomalies, users, userDevices, sosAlerts, drivers } from "../src/db/schema";
import { eq, and, sql, lte, isNotNull, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { sendSms } from "./dprelay";
import { sendNotification } from "./notify";

// T-4: push goes through the shared lib/notify module (token dedupe, the
// notifications audit row, and dead-token pruning) — no third copy here.

// T-2: per-ride cooldown so a deviation fires at most once per window instead
// of on every location ping. In-memory is fine: the WS server is single
// instance (INSTANCE_COUNT=1 hard-enforced at boot).
const ROUTE_DEVIATION_COOLDOWN_MS = 30 * 60 * 1000;
const routeDeviationAlertedAt = new Map<string, number>();

/**
 * Perpendicular distance (meters) from point P to segment AB (equirectangular
 * approx). Exported for tests — this is the metric T-2 rewrote so deviation is
 * measured from the pickup→dropoff corridor, not from the destination.
 */
export function distanceToSegmentMeters(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) * 111320;
}

// Route deviation detection — called from the location handler.
// T-2: deviation is measured from the pickup→dropoff CORRIDOR (perpendicular
// distance to the origin→destination segment), not from the destination —
// distance-from-destination exceeds any threshold for virtually every healthy
// ride, so the old check fired on every ping. The cooldown map dedupes the
// insert + pushes to once per ride per window.
export async function detectRouteDeviation(
  rideId: string, currentLat: number, currentLng: number,
  originLat: number, originLng: number, destLat: number, destLng: number,
  thresholdMeters = 500,
): Promise<void> {
  try {
    const deviation = distanceToSegmentMeters(currentLat, currentLng, originLat, originLng, destLat, destLng);
    if (deviation > thresholdMeters) {
      const lastAlert = routeDeviationAlertedAt.get(rideId) ?? 0;
      if (Date.now() - lastAlert < ROUTE_DEVIATION_COOLDOWN_MS) return;
      routeDeviationAlertedAt.set(rideId, Date.now());

      const [ride] = await db.select({ user_id: rides.user_id, driver_id: rides.driver_id })
        .from(rides).where(eq(rides.id, rideId)).limit(1);

      await db.insert(safetyAnomalies).values({
        ride_id: rideId, anomaly_type: "route_deviation", severity: "high",
        description: `Deviation: ${Math.round(deviation)}m from pickup→dropoff corridor`,
      });
      logger.warn("[safety] route deviation detected", { rideId, deviationMeters: Math.round(deviation) });

      if (ride?.user_id) {
        await sendNotification(
          ride.user_id, "safety:route_deviation", "⚠️ Route Alert",
          "Your driver is on an alternate route. Tap to view map.",
          { ride_id: rideId },
        );
      }

      const adminDevices = await db
        .select({ user_id: userDevices.user_id })
        .from(userDevices)
        .where(
          and(
            sql`EXISTS (SELECT 1 FROM users WHERE users.id = user_devices.user_id AND users.role = 'admin')`,
            isNotNull(userDevices.push_token),
          ),
        )
        .limit(1);

      for (const admin of adminDevices) {
        await sendNotification(
          admin.user_id, "safety_alert", "🚨 Safety Alert",
          `Route deviation on ride ${rideId}. Driver ${ride?.driver_id ?? "unknown"} off by ${Math.round(deviation)}m.`,
          { ride_id: rideId },
        );
      }
    }
  } catch (e) { logger.error('[safety] detectRouteDeviation error', e); }
}

// Stationary anomaly — called from scheduler (60s job)
export async function detectStationaryAnomaly(): Promise<void> {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stuckRides = await db.select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, origin_latitude: rides.origin_latitude, origin_longitude: rides.origin_longitude, updated_at: rides.updated_at }).from(rides)
      .where(and(eq(rides.status, "in_progress"), lte(rides.updated_at, fiveMinAgo)));

    if (stuckRides.length === 0) return;

    // T-3: batch-dedupe the anomaly — one stationary_long row per ride. The
    // scheduler tick is single-writer (running-flag guarded), so a pre-check
    // is race-free here.
    const existing = await db
      .select({ ride_id: safetyAnomalies.ride_id })
      .from(safetyAnomalies)
      .where(and(
        eq(safetyAnomalies.anomaly_type, "stationary_long"),
        inArray(safetyAnomalies.ride_id, stuckRides.map((r) => r.id)),
      ));
    const alreadyFlagged = new Set(existing.map((e) => e.ride_id));

    for (const ride of stuckRides) {
      if (!alreadyFlagged.has(ride.id)) {
        await db.insert(safetyAnomalies).values({
          ride_id: ride.id, driver_id: ride.driver_id, anomaly_type: "stationary_long", severity: "medium",
          description: "Vehicle stationary for 5+ minutes during active ride",
        });

        if (ride.user_id) {
          await sendNotification(
            ride.user_id, "safety:stationary", "⏸️ Ride Paused",
            "Your ride has been stationary. Is everything OK?",
            { ride_id: ride.id },
          );
        }
      }

      // Auto-SOS is gated INDEPENDENTLY of the anomaly flag: a ride flagged
      // on an earlier tick still needs its 10-minute SOS, but never more than
      // one open auto-SOS per ride.
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (!(ride.updated_at && ride.updated_at <= tenMinAgo)) continue;

      const [openSos] = await db
        .select({ id: sosAlerts.id })
        .from(sosAlerts)
        .where(and(eq(sosAlerts.ride_id, ride.id), eq(sosAlerts.status, "open")))
        .limit(1);
      if (openSos) continue;

      // Use the vehicle's last known position (drivers.last_location_*) — not
      // the pickup origin — so the alert shows where the vehicle is now.
      // sosAlerts coordinates are numeric columns (string values in drizzle).
      let lat = ride.origin_latitude ?? "0";
      let lng = ride.origin_longitude ?? "0";
      if (ride.driver_id) {
        const [d] = await db
          .select({ lat: drivers.last_location_lat, lng: drivers.last_location_lng })
          .from(drivers)
          .where(eq(drivers.id, ride.driver_id))
          .limit(1);
        if (d?.lat != null && d?.lng != null) {
          lat = d.lat;
          lng = d.lng;
        }
      }

      try {
        await db.insert(sosAlerts).values({
          user_id: ride.user_id,
          role: "rider",
          latitude: lat,
          longitude: lng,
          ride_id: ride.id,
          message: "Auto SOS: ride stationary for 10+ minutes",
          contacts_notified: [],
          status: "open",
        });
      } catch (e) {
        logger.error("[safety] auto SOS insert failed", { rideId: ride.id, error: e });
      }
    }
  } catch (e) { logger.error("[safety] detectStationaryAnomaly error", e); }
}

// Night ride protocol check
export async function checkNightRideProtocol(rideId: string, driverId: string): Promise<void> {
  try {
    const [ride] = await db.select({ user_id: rides.user_id }).from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride?.user_id) return;

    const [user] = await db.select({ sos_contact: users.sos_contact }).from(users).where(eq(users.id, ride.user_id)).limit(1);
    if (!user?.sos_contact) return;

    // T-5: BDT hour (UTC+6, no DST) — server-local time on a UTC deploy
    // missed almost the entire 22:00–05:00 window.
    const hour = (new Date().getUTCHours() + 6) % 24;
    if (hour >= 22 || hour <= 5) {
      await db.insert(safetyAnomalies).values({
        ride_id: rideId, driver_id: driverId, anomaly_type: "night_ride_no_check", severity: "low",
        description: "Night ride started without safety check",
      });

      const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
      const trackLink = `${serverUrl}/track/${rideId}`;
      try {
        await sendSms(user.sos_contact, `Your contact is on a night ride. Track: ${trackLink}`);
      } catch (e) {
        logger.error("[safety] night ride SMS failed", { rideId, error: e });
      }
    }
  } catch (e) { logger.error('[safety] checkNightRideProtocol error', e); }
}
