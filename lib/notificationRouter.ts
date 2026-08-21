/**
 * Centralized notification & deep-link router.
 *
 * Every push notification tap and deep-link URL is routed through here.
 * This ensures:
 * 1. Only valid routes are navigated to (no dead routes).
 * 2. Dynamic IDs are UUID-validated before navigation (no crashes).
 * 3. Unknown/malformed payloads fail safely (user stays on current screen).
 *
 * Notification data payload contract (set by server via lib/notify.ts):
 *   { type: string; ride_id?: string; ... }
 *
 * Deep-link URL contract:
 *   ride://driver/home
 *   ride://driver/ride-tracking/{uuid}
 *   ride://rider/find-ride
 */

import { router } from "expo-router";
import { logger } from "@/lib/logger";

// ── UUID validation ──────────────────────────────────────────────
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

// ── Notification type → route mapping ────────────────────────────
// Each handler receives the notification data payload and navigates
// to the appropriate screen. If the handler returns false, the
// notification was not routed (unknown type or invalid data).

type NotificationHandler = (
  data: Record<string, string>,
) => boolean;

const DRIVER_NOTIFICATION_ROUTES: Record<string, NotificationHandler> = {
  // Ride lifecycle
  "ride:offer": () => {
    router.push("/(main)/(rider)" as never);
    return true;
  },
  "ride:matched": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(`/(main)/(rider)/find-customer` as never);
      return true;
    }
    router.push("/(main)/(rider)" as never);
    return true;
  },
  "ride:cancelled": () => {
    router.push("/(main)/(rider)" as never);
    return true;
  },
  "rider:cancelled": () => {
    router.push("/(main)/(rider)" as never);
    return true;
  },
  "driver:arrived": () => {
    router.push("/(main)/(rider)" as never);
    return true;
  },

  // Payment & subscription
  "payment:confirmed": () => {
    router.push("/(main)/(rider)/(tabs)/wallet" as never);
    return true;
  },
  "package:activated": () => {
    router.push("/(main)/(rider)/(tabs)/wallet" as never);
    return true;
  },
  "package:expiring": () => {
    router.push("/(main)/(rider)/packages" as never);
    return true;
  },

  // Documents
  "document:expiry": () => {
    router.push("/(main)/(rider)/documents" as never);
    return true;
  },
  "document:rejected": () => {
    router.push("/(main)/(rider)/documents" as never);
    return true;
  },
  "document:approved": () => {
    router.push("/(main)/(rider)/documents" as never);
    return true;
  },

  // Account
  "account:approved": () => {
    router.push("/(main)/(rider)" as never);
    return true;
  },
  "account:suspended": () => {
    router.push("/(main)/(rider)/contact-support" as never);
    return true;
  },
  "account:rejected": (data) => {
    // If there's a reason in the payload, it's shown by DriverStatusGuard
    router.push("/(main)/(rider)" as never);
    return true;
  },

  // Support
  "support:reply": () => {
    router.push("/(main)/(rider)/contact-support" as never);
    return true;
  },

  // SOS
  "sos:acknowledged": () => {
    router.push("/(main)/(rider)" as never);
    return true;
  },

  // Incentive
  "incentive:completed": () => {
    router.push("/(main)/(rider)/incentives" as never);
    return true;
  },
  "incentive:expired": () => {
    router.push("/(main)/(rider)/incentives" as never);
    return true;
  },
};

const RIDER_NOTIFICATION_ROUTES: Record<string, NotificationHandler> = {
  // Ride lifecycle
  "ride:matched": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(`/(main)/(customer)/ride-tracking/${data.ride_id}` as never);
      return true;
    }
    router.push("/(main)/(customer)/(tabs)/home" as never);
    return true;
  },
  "ride:completed": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(`/(main)/(customer)/ride-tracking/${data.ride_id}` as never);
      return true;
    }
    router.push("/(main)/(customer)/(tabs)/home" as never);
    return true;
  },
  "driver:arrived": () => {
    router.push("/(main)/(customer)/(tabs)/home" as never);
    return true;
  },
  "ride:cancelled": () => {
    router.push("/(main)/(customer)/(tabs)/home" as never);
    return true;
  },

  // Payment
  "payment:confirmed": () => {
    router.push("/(main)/(customer)/(tabs)/wallet" as never);
    return true;
  },

  // Promos
  "promo:available": () => {
    router.push("/(main)/(customer)/apply-promos" as never);
    return true;
  },
};

/**
 * Route a notification tap to the correct screen.
 *
 * @param data - The notification data payload (from expo-notifications)
 * @param role - The user's role ('driver' | 'rider')
 * @returns true if routed, false if unknown/unroutable
 */
export function routeNotification(
  data: Record<string, string>,
  role: "driver" | "rider" = "driver",
): boolean {
  const type = data.type;
  if (!type) {
    logger.warn("[notificationRouter] notification without type", { data });
    return false;
  }

  const routes = role === "driver" ? DRIVER_NOTIFICATION_ROUTES : RIDER_NOTIFICATION_ROUTES;
  const handler = routes[type];

  if (!handler) {
    logger.info("[notificationRouter] unhandled notification type", { type, role });
    return false;
  }

  try {
    return handler(data);
  } catch (e) {
    logger.error("[notificationRouter] routing error", { type, error: e });
    return false;
  }
}

// ── Deep-link route validation ───────────────────────────────────

interface DeepLinkRoute {
  pattern: RegExp;
  handler: (match: RegExpMatchArray) => void;
}

/**
 * Valid deep-link routes. The `ride://` scheme is used.
 * Patterns use named capture groups for clarity but are matched positionally.
 */
const DEEP_LINK_ROUTES: DeepLinkRoute[] = [
  // Driver routes
  {
    pattern: /^\/?driver\/?$/,
    handler: () => router.push("/(main)/(rider)" as never),
  },
  {
    pattern: /^\/?driver\/ride-tracking\/([0-9a-f-]{36})$/i,
    handler: (m) => {
      if (isValidUUID(m[1])) router.push("/(main)/(rider)/find-customer" as never);
    },
  },
  {
    pattern: /^\/?driver\/wallet\/?$/,
    handler: () => router.push("/(main)/(rider)/(tabs)/wallet" as never),
  },
  {
    pattern: /^\/?driver\/packages\/?$/,
    handler: () => router.push("/(main)/(rider)/packages" as never),
  },
  {
    pattern: /^\/?driver\/documents\/?$/,
    handler: () => router.push("/(main)/(rider)/documents" as never),
  },
  {
    pattern: /^\/?driver\/support\/?$/,
    handler: () => router.push("/(main)/(rider)/contact-support" as never),
  },
  {
    pattern: /^\/?driver\/safety\/?$/,
    handler: () => router.push("/(main)/(rider)/safety" as never),
  },
  {
    pattern: /^\/?driver\/earnings\/?$/,
    handler: () => router.push("/(main)/(rider)/(tabs)/earning" as never),
  },
  {
    pattern: /^\/?driver\/activity\/?$/,
    handler: () => router.push("/(main)/(rider)/(tabs)/activity" as never),
  },
  {
    pattern: /^\/?driver\/profile\/?$/,
    handler: () => router.push("/(main)/(rider)/(tabs)/profile" as never),
  },
  {
    pattern: /^\/?driver\/settings\/?$/,
    handler: () => router.push("/(main)/(rider)/settings" as never),
  },
  {
    pattern: /^\/?driver\/incentives\/?$/,
    handler: () => router.push("/(main)/(rider)/incentives" as never),
  },
  {
    pattern: /^\/?driver\/ratings\/?$/,
    handler: () => router.push("/(main)/(rider)/ratings" as never),
  },
  {
    pattern: /^\/?driver\/referral\/?$/,
    handler: () => router.push("/(main)/(rider)/referral" as never),
  },

  // Rider (customer) routes
  {
    pattern: /^\/?rider\/?$/,
    handler: () => router.push("/(main)/(customer)/(tabs)/home" as never),
  },
  {
    pattern: /^\/?rider\/ride-tracking\/([0-9a-f-]{36})$/i,
    handler: (m) => {
      if (isValidUUID(m[1]))
        router.push(`/(main)/(customer)/ride-tracking/${m[1]}` as never);
    },
  },
  {
    pattern: /^\/?rider\/wallet\/?$/,
    handler: () => router.push("/(main)/(customer)/(tabs)/wallet" as never),
  },
  {
    pattern: /^\/?rider\/find-ride\/?$/,
    handler: () => router.push("/(main)/(customer)/find-ride" as never),
  },
];

/**
 * Route a deep-link URL to the correct screen.
 *
 * Accepts either a full URL (`ride://driver/wallet`) or a path
 * (`/driver/wallet` or `driver/wallet`).
 *
 * @returns true if routed, false if unknown
 */
export function routeDeepLink(url: string): boolean {
  try {
    // Strip scheme and host if present
    let path = url;
    if (url.includes("://")) {
      const parsed = new URL(url);
      path = parsed.pathname + parsed.search;
    }
    // Strip leading slash for matching
    path = path.replace(/^\/+/, "");

    for (const route of DEEP_LINK_ROUTES) {
      const match = path.match(route.pattern);
      if (match) {
        route.handler(match);
        return true;
      }
    }

    logger.info("[notificationRouter] unmatched deep link", { url });
    return false;
  } catch (e) {
    logger.error("[notificationRouter] deep link parse error", { url, error: e });
    return false;
  }
}
