import { useRiderStore } from "@/store/useRiderStore";
import { useDriverStore } from "@/store/useDriverStore";
import { useChatStore } from "@/store/useChatStore";
import { useDriverStatusStore } from "@/store/useDriverStatusStore";
import { usePackageStore } from "@/store/usePackageStore";
import { useCallLedgerStore } from "@/store/useCallLedgerStore";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useDeliveryStore } from "@/store/useDeliveryStore";
import { useEmergencyStore } from "@/store/useEmergencyStore";
import { useFleetStore } from "@/store/useFleetStore";
import { useRentalStore } from "@/store/useRentalStore";
import { useShopStore } from "@/store/useShopStore";
import {
  useAppUserStore,
  useCustomer,
  useDriver,
  useDriverDetails,
  useRideOfferStore,
  useRidesStore,
  useDriverStore as useDriverStoreBarrel,
} from "@/store";
import { teardownRiderSocket } from "@/lib/riderSocket";
import { teardownShopSocket } from "@/lib/shopSocket";
import { clearQueue } from "@/lib/sosQueue";
import { supabase } from "@/lib/supabase";
import { revokePushTokenOnSignOut } from "@/lib/pushRevoke";
import { logger } from "@/lib/logger";

/**
 * Single source of truth for sign-out state cleanup (§6.10 / §7, D6-1).
 *
 * Tears down the WebSocket singletons (audit H-1) and resets EVERY store in
 * the registry below. Each entry is called through the uniform guarded
 * pattern (`reset`, else `clear`); a store with neither is LOUD (warn with
 * its name), never silently skipped — so the next store addition cannot
 * escape teardown by forgetting its reset method. The header states no
 * count: the registry IS the list, and the shared A→B regression
 * (lib/__tests__/authCleanup.test.ts) pins every entry by name.
 *
 * Two rules the doc makes binding:
 * - Import driver SESSION state from `@/store/useDriverStore` ONLY. The
 *   barrel keeps its own nearby-drivers `useDriverStore` (read by
 *   RideLayout/FinalDetails); it resets through this registry like every
 *   other store, but new driver-session reads still belong on the file store.
 * - Never touch barrel stores outside this registry (useWSStore is the
 *   sanctioned exception: it lives only in the barrel and is reset via
 *   teardownRiderSocket()).
 *
 * The caller is responsible for `supabase.auth.signOut()` (async) and for
 * NOT navigating manually afterward — the auth gate handles the redirect.
 */

interface RegistryStore {
  name: string;
  getState: () => { reset?: unknown; clear?: unknown };
  setState: (partial: Record<string, unknown>) => void;
}

// zustand's SetState<T> is not assignable to a generic partial-writer (a
// Record<string, unknown> is not a Partial<T> for any concrete T), so the
// uniform writer goes through one documented unknown-cast per entry. The
// test only ever writes data keys it read back via getState().
const entry = (
  name: string,
  hook: {
    getState: () => { reset?: unknown; clear?: unknown };
    setState: unknown;
  },
): RegistryStore => ({
  name,
  getState: () => hook.getState(),
  setState: (partial) =>
    (hook.setState as (p: Record<string, unknown>) => void)(partial),
});

/** Every client store holding per-account state. Add new stores HERE. */
export const storeRegistry: RegistryStore[] = [
  // File stores — the original 7.
  entry("rider", useRiderStore),
  entry("driver", useDriverStore),
  entry("chat", useChatStore),
  entry("driverStatus", useDriverStatusStore),
  entry("package", usePackageStore),
  entry("callLedger", useCallLedgerStore),
  entry("driverFlow", useDriverFlowStore),
  // File stores — D6-1 additions (all five already expose reset()).
  entry("delivery", useDeliveryStore),
  entry("emergency", useEmergencyStore),
  entry("fleet", useFleetStore),
  entry("rental", useRentalStore),
  entry("shop", useShopStore),
  // Barrel stores — D6-1 wholesale reset()s.
  entry("rideOffer", useRideOfferStore),
  entry("customer", useCustomer),
  entry("driverBarrel", useDriver),
  entry("appUser", useAppUserStore),
  entry("rides", useRidesStore),
  entry("driverDetails", useDriverDetails),
  entry("driverStoreBarrel", useDriverStoreBarrel),
];

/** Run every registry reset. Loud on gaps — never silently partial. */
export function resetAllStores(): void {
  for (const { name, getState } of storeRegistry) {
    let state: { reset?: unknown; clear?: unknown };
    try {
      state = getState();
    } catch (err) {
      logger.warn("[authCleanup] store unreadable at teardown", {
        name,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (typeof state.reset === "function") {
      (state.reset as () => void)();
    } else if (typeof state.clear === "function") {
      (state.clear as () => void)();
    } else {
      logger.warn("[authCleanup] store has neither reset nor clear", { name });
    }
  }
}

export function authCleanup(): void {
  // H-1: kill the WebSockets FIRST. A live socket keeps writing into the
  // stores while they reset, and one left open (still authenticated as the
  // previous user) must never be adopted by the next sign-in — the shared
  // WS slot is identity-tagged for exactly this.
  teardownRiderSocket();
  // S3: the shop dashboard socket also dies with the session.
  teardownShopSocket();
  resetAllStores();

  // Clear the SOS queue to prevent cross-account leakage.
  // The rider store reset() above already clears stagedPromo (client-side).
  // Server-side staged promos (promoCache.ts) expire via 10-min TTL.
  // Best-effort — we don't await because authCleanup is synchronous.
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) {
      clearQueue(session.user.id).catch(() => {});
    }
    // D2-1 revoke-on-logout: best-effort server revoke of this account's
    // device push-token rows while the token still identifies the account.
    // Every teardown funnel (logout screens, admin sign-out, account
    // delete, role-switch teardowns) runs through here, so all are
    // covered. Fire-and-forget — never blocks sign-out.
    void revokePushTokenOnSignOut(session?.access_token).catch(() => {});
  }).catch(() => {});
}
