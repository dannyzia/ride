import * as Location from "expo-location";
import { logger } from "@/lib/logger";

/**
 * One bounded attempt at the driver's position, with a last-known fallback.
 *
 * `Location.getCurrentPositionAsync` has no timeout of its own, and indoors the
 * GPS provider can simply never produce a fix (`adb shell dumpsys location`
 * showed `gps provider: last location=null` while fused/network had a cached
 * one). Every unbounded caller therefore parks forever at the await — observed
 * live on the driver device, 2026-09-20, as the home screen sitting on
 * "Getting your location..." indefinitely while the app was online.
 *
 * That is worse for dispatch than for the UI: the heartbeat is what keeps
 * `drivers.last_location_at` fresh, and the server excludes anyone past
 * HEARTBEAT_STALE_MS (120s). A hung fix means an online, moving driver is
 * silently un-dispatchable, with nothing in the logs to say why.
 *
 * Bounded race + `getLastKnownPositionAsync()` is the pattern the rider side
 * already uses (`app/(main)/(customer)/find-ride/index.tsx`), so this is the
 * same convention applied where the driver's dispatchability depends on it. A
 * cached fix is far better than none: it is the driver's last known position,
 * and the next tick usually gets a fresh one.
 */
const FIX_TIMEOUT_MS = 8_000;

export async function getDriverFix(): Promise<{ lat: number; lng: number } | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    logger.warn("[driver] foreground location permission not granted");
    return null;
  }

  let loc: Location.LocationObject | null = null;
  try {
    loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
  } catch (e) {
    logger.warn(
      "[driver] getCurrentPositionAsync threw:",
      e instanceof Error ? e.message : e,
    );
  }

  if (!loc) {
    logger.info("[driver] trying last known position fallback");
    try {
      loc = await Location.getLastKnownPositionAsync();
    } catch (e) {
      logger.warn(
        "[driver] last known position threw:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (!loc) return null;
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}
