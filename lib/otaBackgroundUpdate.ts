/**
 * Silent background OTA polling (EAS Update / expo-updates).
 *
 * Purpose:   proactively download JS updates while a driver is actively on
 *            shift, so they apply silently on the next cold boot. Launch-time
 *            behavior is unchanged: `app.config.js` sets
 *            `fallbackToCacheTimeout: 0`, so cold boots always start instantly
 *            on the cached bundle — this module only pre-downloads payloads
 *            for LATER boots.
 *
 * Lifecycle: the poll interval runs ONLY while the driver is ONLINE or ON_TRIP
 *            (both map to `useDriverFlowStore.isOnline === true` — a driver
 *            cannot accept a trip while offline) AND their account status is
 *            `active` (`pending`/`suspended`/`rejected` clear the interval).
 *            Transitions off those states clear the interval immediately.
 *
 * UX:        completely invisible. No spinner, toast, banner, or popup. No
 *            `reloadAsync()` — never interrupts the driver mid-shift.
 *
 * Thread safety of GPS: all work here is awaited async (native module calls);
 * nothing blocks the JS thread between polls, and the poll fires at most once
 * per hour with an overlap guard, so it cannot contend with location updates.
 *
 * Driver ↔ vehicle assignment: this module performs no writes, no DB access,
 * and no navigation — it cannot interact with assignment validations.
 *
 * **Owner:**       Coding model (Orchestrator executes)
 * **Related:**
 *   - app.config.js `updates` block — EAS Update URL + fallbackToCacheTimeout: 0
 *   - store/useDriverFlowStore.ts — canonical isOnline toggle
 *   - store/useDriverStatusStore.ts — account status gate ('active' required)
 *   - lib/logger.ts — error logging (console logging banned per AGENTS.md)
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import { logger } from "@/lib/logger";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useDriverStatusStore } from "@/store/useDriverStatusStore";

// Spec: poll once every 60 minutes while active.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

// Overlap guard — a poll never starts while a previous one is in flight.
let checkInFlight = false;

/**
 * Check EAS Update for a new bundle; if one exists, download it into local
 * storage. The payload stays DORMANT — it applies naturally on the next
 * cold boot via expo-updates' normal launch path. Never calls reloadAsync.
 *
 * All errors (network, storage, native) are caught and suppressed with the
 * structured logger — failures are always non-fatal and invisible to the user.
 */
export async function silentBackgroundUpdateCheck(): Promise<void> {
  if (checkInFlight) return;
  checkInFlight = true;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Deliberately NO Updates.reloadAsync() here. The fetched bundle
      // activates on the next cold restart, per the OTA UX contract.
      logger.debug("[ota] update downloaded — applies on next cold boot");
    }
  } catch (err) {
    // Suppress all network/native errors — OTA polling is best-effort and
    // must never surface anything to the driver.
    logger.warn("[ota] background update check failed (suppressed)", err);
  } finally {
    checkInFlight = false;
  }
}

/**
 * Hook: mounts the polling lifecycle at the app root (app/_layout.tsx).
 * Starts the hourly interval only when the driver is explicitly ONLINE
 * (or ON_TRIP — both hold isOnline=true) with account status 'active';
 * clears it immediately on OFFLINE / suspended / rejected / pending.
 *
 * No-ops entirely on web (EAS Update is native-only) and in dev-client
 * builds where checkForUpdateAsync is unavailable (it throws outside of
 * release builds — guarded by isEmbeddedLaunch).
 */
export function useOtaBackgroundPolling(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;
    // Dev builds (Metro) have no update server — Updates API throws there.
    if (__DEV__ || !Updates.isEnabled) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const isEligible = (): boolean => {
      const online = useDriverFlowStore.getState().isOnline;
      const accountStatus = useDriverStatusStore.getState().driverStatus;
      // ONLINE or ON_TRIP (isOnline stays true on a trip). OFFLINE /
      // suspended / blocked / pending all fall through to false.
      return online === true && accountStatus === "active";
    };

    const syncInterval = (): void => {
      if (isEligible()) {
        if (!intervalId) {
          intervalId = setInterval(() => {
            if (isEligible()) void silentBackgroundUpdateCheck();
          }, POLL_INTERVAL_MS);
        }
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Subscribe to both state slices; re-evaluate the interval on any change.
    const unsubFlow = useDriverFlowStore.subscribe(syncInterval);
    const unsubStatus = useDriverStatusStore.subscribe(syncInterval);

    // Respect driver status on mount (app may cold-boot while already online).
    syncInterval();

    return () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      unsubFlow();
      unsubStatus();
    };
  }, []);
}
