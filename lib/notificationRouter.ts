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
 *   node://driver/home
 *   node://driver/ride-tracking/{uuid}
 *   node://rider
 */

import { router } from "expo-router";
import { logger } from "@/lib/logger";
import { getRideVerticalEnabled } from "@/lib/verticalFlags";

/**
 * Stage 3 (#15): while the flag hides ride, ride/driver push targets land
 * on the services hub instead (the central (main) guard backstops any
 * stragglers). Flag on ⇒ the target passes through unchanged.
 */
function rideAware(target: string): string {
  return getRideVerticalEnabled()
    ? target
    : ("/(main)/(customer)/services-hub" as string);
}

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
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },
  "ride:matched": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(`/(main)/(rider)/find-customer` as never);
      return true;
    }
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },
  "ride:cancelled": () => {
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },
  "rider:cancelled": () => {
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },
  "driver:arrived": () => {
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },

  // Payment & subscription
  "payment:confirmed": () => {
    router.push(rideAware("/(main)/(rider)/d/wallet") as never);
    return true;
  },
  "package:activated": () => {
    router.push(rideAware("/(main)/(rider)/d/wallet") as never);
    return true;
  },
  "package:expiring": () => {
    router.push(rideAware("/(main)/(rider)/packages") as never);
    return true;
  },

  // Documents
  "document:expiry": () => {
    router.push(rideAware("/(main)/(rider)/documents") as never);
    return true;
  },
  "document:rejected": () => {
    router.push(rideAware("/(main)/(rider)/documents") as never);
    return true;
  },
  "document:approved": () => {
    router.push(rideAware("/(main)/(rider)/documents") as never);
    return true;
  },

  // Account
  "account:approved": () => {
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },
  "account:suspended": () => {
    router.push(rideAware("/(main)/(rider)/contact-support") as never);
    return true;
  },
  "account:rejected": (data) => {
    // If there's a reason in the payload, it's shown by DriverStatusGuard
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },

  // Support
  "support:reply": () => {
    router.push(rideAware("/(main)/(rider)/contact-support") as never);
    return true;
  },

  // SOS
  "sos:acknowledged": () => {
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },

  // Incentive
  "incentive:completed": () => {
    router.push(rideAware("/(main)/(rider)/incentives") as never);
    return true;
  },
  "incentive:expired": () => {
    router.push(rideAware("/(main)/(rider)/incentives") as never);
    return true;
  },

  // Shop orders (F-29) — a driver account can order AND own a shop.
  "shop:new_order": () => {
    router.push("/(main)/(shop-owner)" as never);
    return true;
  },
  "shop:order_status": (data) => {
    if (data.order_id && isValidUUID(data.order_id)) {
      router.push(`/(main)/(customer)/(shops)/orders/${data.order_id}` as never);
      return true;
    }
    router.push("/(main)/(customer)/(shops)/orders" as never);
    return true;
  },
  // S6 (§6.1): courier search exhausted / failed → the shop's F-12 fallback.
  "shop:delivery_exhausted": (data) => {
    if (data.order_id && isValidUUID(data.order_id)) {
      router.push(`/(main)/(shop-owner)` as never);
      return true;
    }
    router.push("/(main)/(shop-owner)" as never);
    return true;
  },
  // S6: dispatched delivery offers land in the delivery-agent inbox
  // (Deliveries ON drivers route here too — one active job at a time).
  "delivery:offer": () => {
    router.push("/(main)/(delivery)" as never);
    return true;
  },
  // P2P parcel legs (order_id linkage): a sender tapping their parcel push
  // lands on the parcel tracking screen, not the courier inbox.
  "delivery:status": (data) => {
    if (data.leg_id && isValidUUID(data.leg_id)) {
      router.push(`/(main)/(customer)/parcel/request-detail?id=${data.leg_id}` as never);
      return true;
    }
    router.push("/(main)/(delivery)" as never);
    return true;
  },
  // Staff lane (Flow 15): the invitee lands on the shop surface —
  // /api/shop/mine scopes it orders-only server-side.
  "shop:staff_invite": () => {
    router.push("/(main)/(shop-owner)" as never);
    return true;
  },
  // Extra-charge resolution → the proposing driver (mirrors the C4-3
  // propose→rider fan-out; PATCH sends this after the commit).
  "ride:extra_charge_resolved": () => {
    router.push(rideAware("/(main)/(rider)/d") as never);
    return true;
  },
};

const RIDER_NOTIFICATION_ROUTES: Record<string, NotificationHandler> = {
  // Ride lifecycle
  "ride:matched": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(rideAware(`/(main)/(customer)/ride-tracking/${data.ride_id}`) as never);
      return true;
    }
    router.push(rideAware("/(main)/(customer)/(tabs)/home") as never);
    return true;
  },
  "ride:completed": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(rideAware(`/(main)/(customer)/ride-tracking/${data.ride_id}`) as never);
      return true;
    }
    router.push(rideAware("/(main)/(customer)/(tabs)/home") as never);
    return true;
  },
  "driver:arrived": () => {
    router.push(rideAware("/(main)/(customer)/(tabs)/home") as never);
    return true;
  },
  "ride:cancelled": () => {
    router.push(rideAware("/(main)/(customer)/(tabs)/home") as never);
    return true;
  },
  // Phase G: post-cancellation survey invite on driver-cancelled rides —
  // deep-links to the ride screen where the survey prompt is shown.
  "ride:cancel_survey": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(rideAware(`/(main)/(customer)/ride-tracking/${data.ride_id}`) as never);
      return true;
    }
    router.push(rideAware("/(main)/(customer)/(tabs)/home") as never);
    return true;
  },
  // C4-3: driver-proposed toll/parking charge — deep-links to the active
  // ride, where ExtraChargeApproval renders the approve/dispute card.
  "ride:extra_charge_proposed": (data) => {
    if (data.ride_id && isValidUUID(data.ride_id)) {
      router.push(rideAware(`/(main)/(customer)/ride-tracking/${data.ride_id}`) as never);
      return true;
    }
    router.push(rideAware("/(main)/(customer)/(tabs)/home") as never);
    return true;
  },

  // Payment
  "payment:confirmed": () => {
    router.push("/(main)/(customer)/(tabs)/wallet" as never);
    return true;
  },

  // Promos
  // The apply-promos code-entry screen was deleted; promos now surface inline on
  // the home booking sheet, and the loyalty/points screen keeps a list place for
  // any future promo surface. Prefer loyalty; fall back to home only if loyalty is
  // ever removed.
  "promo:available": () => {
    router.push("/(main)/(customer)/(tabs)/settings/loyalty" as never);
    return true;
  },

  // Shop orders (F-29).
  "shop:new_order": () => {
    router.push("/(main)/(shop-owner)" as never);
    return true;
  },
  "shop:order_status": (data) => {
    if (data.order_id && isValidUUID(data.order_id)) {
      router.push(`/(main)/(customer)/(shops)/orders/${data.order_id}` as never);
      return true;
    }
    router.push("/(main)/(customer)/(shops)/orders" as never);
    return true;
  },
  // S6 (§6.1): courier search exhausted / failed → the shop's F-12 fallback.
  "shop:delivery_exhausted": () => {
    router.push("/(main)/(shop-owner)" as never);
    return true;
  },
  "delivery:offer": () => {
    router.push("/(main)/(delivery)" as never);
    return true;
  },
  // P2P parcel legs (order_id linkage): the sender's parcel pushes carry
  // leg_id — deep-link to the tracking screen; anything else falls back to
  // the sender's parcel list (riders cannot open the courier inbox).
  "delivery:status": (data) => {
    if (data.leg_id && isValidUUID(data.leg_id)) {
      router.push(`/(main)/(customer)/parcel/request-detail?id=${data.leg_id}` as never);
      return true;
    }
    router.push("/(main)/(customer)/parcel" as never);
    return true;
  },
  // Staff lane (Flow 15): the invitee lands on the shop surface.
  "shop:staff_invite": () => {
    router.push("/(main)/(shop-owner)" as never);
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
 * Valid deep-link routes. The `node://` scheme is used.
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
      if (isValidUUID(m[1])) router.push(rideAware("/(main)/(rider)/find-customer") as never);
    },
  },
  {
    pattern: /^\/?driver\/wallet\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/d/wallet") as never),
  },
  {
    pattern: /^\/?driver\/packages\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/packages") as never),
  },
  {
    pattern: /^\/?driver\/documents\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/documents") as never),
  },
  {
    pattern: /^\/?driver\/support\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/contact-support") as never),
  },
  {
    pattern: /^\/?driver\/safety\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/safety") as never),
  },
  {
    pattern: /^\/?driver\/earnings\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/d/earning") as never),
  },
  {
    pattern: /^\/?driver\/activity\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/d/activity") as never),
  },
  {
    pattern: /^\/?driver\/profile\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/d/profile") as never),
  },
  {
    pattern: /^\/?driver\/settings\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/settings") as never),
  },
  {
    pattern: /^\/?driver\/incentives\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/incentives") as never),
  },
  {
    pattern: /^\/?driver\/ratings\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/ratings") as never),
  },
  {
    pattern: /^\/?driver\/referral\/?$/,
    handler: () => router.push(rideAware("/(main)/(rider)/referral") as never),
  },

  // Rider (customer) routes
  {
    pattern: /^\/?rider\/?$/,
    handler: () => router.push(rideAware("/(main)/(customer)/(tabs)/home") as never),
  },
  {
    pattern: /^\/?rider\/ride-tracking\/([0-9a-f-]{36})$/i,
    handler: (m) => {
      if (isValidUUID(m[1]))
        router.push(rideAware(`/(main)/(customer)/ride-tracking/${m[1]}`) as never);
    },
  },
  {
    pattern: /^\/?rider\/wallet\/?$/,
    handler: () => router.push("/(main)/(customer)/(tabs)/wallet" as never),
  },
  {
    // Legacy alias: the find-ride screen was deleted; old shared links land on home.
    pattern: /^\/?rider\/find-ride\/?$/,
    handler: () => router.push(rideAware("/(main)/(customer)/(tabs)/home") as never),
  },
];

/**
 * Route a deep-link URL to the correct screen.
 *
 * Accepts either a full URL (`node://driver/wallet`) or a path
 * (`/driver/wallet` or `driver/wallet`).
 *
 * @returns true if routed, false if unknown
 */
export function routeDeepLink(url: string): boolean {
  try {
    // Strip scheme and host if present. For custom schemes (node://) the
    // first path segment lands in `hostname` — e.g. node://rider/wallet has
    // host 'rider' and path '/wallet'. Reconstruct host + path so the
    // role-prefixed patterns below match full scheme links.
    let path = url;
    if (url.includes("://")) {
      const parsed = new URL(url);
      path =
        (parsed.hostname ? parsed.hostname + parsed.pathname : parsed.pathname) +
        parsed.search;
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
