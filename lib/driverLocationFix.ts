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
/**
 * Bound on the permission reads. They are awaited BEFORE the fix race and the
 * last-known read, so an unbounded await here makes both of those unreachable —
 * and this module is used by the driver heartbeat, whose silence is what makes
 * an online driver un-dispatchable.
 */
const PERMISSION_TIMEOUT_MS = 3_000;
/** The request prompt is slower than a read (it may show UI), so it gets more. */
const PERMISSION_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Resolve `p`, or `fallback` after `ms`. The loser is left to settle on its own.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      const timer = setTimeout(() => resolve(fallback), ms);
      // Never hold the process open for a timer that only exists to stop waiting.
      (timer as { unref?: () => void }).unref?.();
    }),
  ]);
}

/**
 * Permission gate that CANNOT block the fix attempt.
 *
 * 2026-09-20, on-device: the app reported `hasGps: false` while
 * ACCESS_FINE_LOCATION was granted, location services were on, and the OS held a
 * fused last-known fix — with the driver home screen stuck on "Getting your
 * location..." and zero heartbeat frames. The only unbounded await on that path
 * was `requestForegroundPermissionsAsync()` at the top of this function, which
 * sits BEFORE both the 8s fix race and the last-known read: if it never
 * resolves, the last-known read is not merely slow, it is never reached. That is
 * exactly the shape of a stale `hasGps`, and it makes every caller silent at
 * once (mount effect, heartbeat, and the online toggle's coordinate payload).
 *
 * So: read the CURRENT permission first (no prompt, cheap), re-request only when
 * it is actually missing, and bound both. A timeout or a throw is treated as
 * "unknown", which proceeds to the fix attempt — a wrong guess there fails
 * harmlessly in the try/catch below, whereas a wrong `return null` here would
 * reproduce the exact bug: a driver who can never go online.
 */
async function ensureForegroundPermission(): Promise<boolean> {
  try {
    const current = await withTimeout(Location.getForegroundPermissionsAsync(), PERMISSION_TIMEOUT_MS, null);
    if (current?.granted) return true;
    // Not granted, or unreadable — ask, but do not wait forever for the answer.
    const requested = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      PERMISSION_REQUEST_TIMEOUT_MS,
      null,
    );
    if (requested && !requested.granted) return false;
    return true;
  } catch (e) {
    logger.warn(
      "[driver] permission read failed, attempting a fix anyway:",
      e instanceof Error ? e.message : e,
    );
    return true;
  }
}

export async function getDriverFix(): Promise<{ lat: number; lng: number } | null> {
  if (!(await ensureForegroundPermission())) {
    logger.warn("[driver] foreground location permission not granted");
    // Still try the last-known read: it is a permission-independent cached value
    // on Android, and a fresh prompt may simply not have been answerable.
    try {
      const cached = await Location.getLastKnownPositionAsync();
      if (cached) {
        return { lat: cached.coords.latitude, lng: cached.coords.longitude };
      }
    } catch {
      // Nothing cached and no permission — no fix to report.
    }
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
