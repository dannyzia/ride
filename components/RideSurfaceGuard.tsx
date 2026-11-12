/**
 * RideSurfaceGuard (Node launch Stage 3 — hide inventory #13, #14, #20, #21,
 * #22, #23; D-9 as amended 2026-11-11).
 *
 * Mounted ONCE in app/(main)/_layout.tsx (which wraps every `(main)` route).
 * While `ride_vertical_enabled` is false, any ride or driver route redirects
 * to the services hub regardless of how it was reached — back navigation,
 * stale deep links, or future code. Ride screen files themselves stay
 * untouched on disk (hide-never-delete).
 *
 * Flag on ⇒ this component is a no-op (zero behavior change).
 */
import { useEffect } from "react";
import { router, useSegments } from "expo-router";
import { getRideVerticalEnabled } from "@/lib/verticalFlags";
import { logger } from "@/lib/logger";

const SERVICES_HUB = "/(main)/(customer)/services-hub";

/**
 * The ride-route set (dormant-mode contract): any NEW ride route (re-enable
 * work or future code) must be registered here. Derived from hide-inventory
 * #20 + #23 — the file set was verified against the repo's route tree at
 * implementation (app/(main)/(customer)/(tabs)/{home,rides,chat} plus the
 * sixteen standalone per-ride screens and the whole (main)/(rider) group).
 *
 * Matching normalizes expo-router segments: route groups ("(tabs)", …) and
 * dynamic params ("[rideId]") are dropped, so e.g. chat/[rideId] and
 * (tabs)/chat both normalize to "chat".
 */
const RIDE_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  // (tabs) surfaces (#20, #21)
  "home",
  "rides",
  "chat",
  // standalone per-ride flow screens (#23)
  "schedule-ride",
  "ride-detail",
  "ride-tracking",
  "ride-details-scheduled",
  "ride-scheduled",
  "finding-driver",
  "no-drivers-available",
  "user-arrived",
  "rate-driver",
  "driver-info",
  "add-tip",
  "fare-dispute",
  "cancel-reason",
  "canceled",
  "report-issue",
]);

function isRideRoute(segments: readonly string[]): boolean {
  if (segments[0] !== "(main)") return false;
  // #22: the whole (main)/(rider) group (the legacy-named DRIVER experience).
  if (segments[1] === "(rider)") return true;
  // Customer-side: drop the group segments, then normalize dynamic params
  // and trailing "index" leaves to their route stem.
  const stem = segments
    .slice(2)
    .filter((s) => !s.startsWith("(") && !s.startsWith("[") && s !== "index")
    .join("/");
  return RIDE_ROUTE_SEGMENTS.has(stem);
}

export default function RideSurfaceGuard() {
  const segments = useSegments();

  useEffect(() => {
    // Flag on ⇒ no-op (inventory rows render exactly as before).
    if (getRideVerticalEnabled()) return;
    if (!isRideRoute(segments)) return;
    logger.info("[RideSurfaceGuard] ride route blocked while flag off", {
      segments,
    });
    router.replace(SERVICES_HUB);
  }, [segments]);

  return null;
}
