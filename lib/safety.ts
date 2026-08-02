import { db } from "@/src/db";
import { rides, drivers, safetyAnomalies, users, userDevices, sosAlerts } from "@/src/db/schema";
import { eq, and, sql, lte, isNotNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { sendSms } from "@/lib/dprelay";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendPushToUser(
  userId: string,
  notification: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  try {
    const devices = await db
      .select({ push_token: userDevices.push_token })
      .from(userDevices)
      .where(eq(userDevices.user_id, userId));
    if (devices.length === 0) return;

    await Promise.allSettled(
      devices.map((d) =>
        fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: d.push_token,
            title: notification.title,
            body: notification.body,
            data: notification.data ?? {},
            sound: "default",
            priority: "high",
          }),
        }),
      ),
    );
  } catch (e: any) {
    logger.error("[safety] sendPushToUser failed", { userId, error: e.message });
  }
}

// Route deviation detection — called from location handler
export async function detectRouteDeviation(
  rideId: string, currentLat: number, currentLng: number,
  expectedLat: number, expectedLng: number, thresholdMeters = 500,
): Promise<void> {
  try {
    const deviation = Math.sqrt((currentLat - expectedLat) ** 2 + (currentLng - expectedLng) ** 2) * 111320;
    if (deviation > thresholdMeters) {
      const [ride] = await db.select({ user_id: rides.user_id, driver_id: rides.driver_id })
        .from(rides).where(eq(rides.id, rideId)).limit(1);

      await db.insert(safetyAnomalies).values({
        ride_id: rideId, anomaly_type: "route_deviation", severity: "high",
        description: `Deviation: ${Math.round(deviation)}m from expected location`,
      });
      logger.warn("[safety] route deviation detected", { rideId, deviationMeters: Math.round(deviation) });

      if (ride?.user_id) {
        try {
          await sendPushToUser(ride.user_id, {
            title: "⚠️ Route Alert",
            body: "Your driver is on an alternate route. Tap to view map.",
            data: { ride_id: rideId },
          });
        } catch (e) { /* non-blocking */ }
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
        try {
          await sendPushToUser(admin.user_id, {
            title: "🚨 Safety Alert",
            body: `Route deviation on ride ${rideId}. Driver ${ride?.driver_id ?? "unknown"} off by ${Math.round(deviation)}m.`,
            data: { ride_id: rideId, type: "safety_alert" },
          });
        } catch (e) { /* non-blocking */ }
      }
    }
  } catch (e) { logger.error('[safety] detectRouteDeviation error', e); }
}

// Stationary anomaly — called from scheduler (5-min job)
export async function detectStationaryAnomaly(): Promise<void> {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stuckRides = await db.select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, origin_latitude: rides.origin_latitude, origin_longitude: rides.origin_longitude, updated_at: rides.updated_at }).from(rides)
      .where(and(eq(rides.status, "in_progress"), lte(rides.updated_at, fiveMinAgo)));
    for (const ride of stuckRides) {
      await db.insert(safetyAnomalies).values({
        ride_id: ride.id, driver_id: ride.driver_id, anomaly_type: "stationary_long", severity: "medium",
        description: "Vehicle stationary for 5+ minutes during active ride",
      });

      if (ride.user_id) {
        try {
          await sendPushToUser(ride.user_id, {
            title: "⏸️ Ride Paused",
            body: "Your ride has been stationary. Is everything OK?",
            data: { ride_id: ride.id },
          });
        } catch (e) { /* non-blocking */ }
      }

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (ride.updated_at && ride.updated_at <= tenMinAgo) {
        try {
          await db.insert(sosAlerts).values({
            user_id: ride.user_id,
            role: "rider",
            latitude: ride.origin_latitude ?? 0,
            longitude: ride.origin_longitude ?? 0,
            message: "Auto SOS: ride stationary for 10+ minutes",
            contacts_notified: [],
            status: "open",
          });
        } catch (e) {
          logger.error("[safety] auto SOS insert failed", { rideId: ride.id, error: e });
        }
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

    const hour = new Date().getHours();
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
