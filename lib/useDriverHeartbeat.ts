import { useEffect, useRef } from "react";
import { logger } from "@/lib/logger";
import { getDriverFix } from "@/lib/driverLocationFix";
import { useDriverStore } from "@/store/useDriverStore";
import { useWSStore } from "@/store";

/**
 * Driver location heartbeat — 10s while online, for the whole driver tab area.
 *
 * ── Why this is not on the driver home screen any more ──────────────────────
 *
 * It used to live in the driver home tab's own `useEffect`. That made location
 * reporting a property of ONE SCREEN rather than of being online, so a driver
 * who was online but had navigated to another tab (Activity, Wallet, Rental
 * Requests, Profile) kept an authenticated socket and `drivers.is_online = true`
 * while sending nothing. The server's candidate pool then excluded them for
 * stale location — dispatch.ts's M2 rule drops anyone whose last heartbeat is
 * older than HEARTBEAT_STALE_MS (120s, shared with h3Index.ts) — so they were
 * invisible to dispatch while the app looked connected.
 *
 * Live, 2026-09-20: a driver on the Rental Requests tab had been silent long
 * enough that `drivers.last_location_at` was 4.2 DAYS old. A booking built its
 * pool with `candidatesFound: 1` and scored `0` — no offer could exist, because
 * the only candidate was permanently un-dispatchable.
 *
 * Mounted from `app/(main)/(rider)/d/(tabs)/_layout.tsx`, so it covers every
 * driver tab. It reads the socket LIVE from the store (never a per-mount ref,
 * see C2 below) and restarts when the socket identity changes, so a reconnect
 * gets a heartbeat immediately rather than up to 10s later.
 *
 * Deliberately silent about the home screen's map: the home screen runs its own
 * location effect for its own UI, so this hook has no `setLocation` coupling.
 */
const HEARTBEAT_INTERVAL_MS = 10_000;

export function useDriverHeartbeat(): void {
  const isOnline = useDriverStore((s) => s.isOnline);
  // Reactive, not `getState()`: a reconnect replaces the socket, and the effect
  // must re-arm on that change. The store is updated on every onopen.
  const ws = useWSStore((s) => s.ws);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Every gate that can stop this hook is logged, because a driver silently
    // disappearing from the H3 index is indistinguishable from a dead device
    // otherwise — the server sees no heartbeats and the app looks idle. That is
    // the decay observed on 2026-09-20: beats stopped while the Pixel was Awake
    // and focused, `connected_drivers` held at 1, and `drivers_indexed` fell
    // 1 -> 0. Symptom without a reason is what made that take an hour to find.
    if (!isOnline) {
      logger.info("[driver] heartbeat idle — app state is offline", {
        note: "no beats are sent while offline; nothing else will report location",
      });
      return;
    }
    logger.info("[driver] heartbeat armed", {
      intervalMs: HEARTBEAT_INTERVAL_MS,
      socketReadyState: useWSStore.getState().ws?.readyState ?? null,
    });

    const sendHeartbeat = async () => {
      // C2: read the socket LIVE from the store, never a per-mount ref. An
      // unmounted mount's orphaned onclose kept rebuilding the socket and
      // writing its own wsRef, so the current mount's ref could point at a dead
      // socket forever — heartbeats silently died while the store (and the
      // green dot) still said connected.
      const liveWs = useWSStore.getState().ws;
      if (!liveWs || liveWs.readyState !== WebSocket.OPEN) {
        logger.warn("[driver] heartbeat skipped — socket not open", {
          readyState: liveWs?.readyState ?? null,
        });
        return;
      }
      try {
        // Bounded fix with a last-known fallback (lib/driverLocationFix): the
        // unbounded call parks forever indoors, which silently starves the
        // server's freshness rule and makes an online driver un-dispatchable.
        const fix = await getDriverFix();
        if (!fix) {
          logger.warn("[driver] heartbeat skipped — no location fix available");
          return;
        }
        liveWs.send(
          JSON.stringify({
            type: "heartbeat",
            lat: fix.lat,
            lng: fix.lng,
            ts: new Date().toISOString(),
          }),
        );
      } catch (e) {
        logger.warn(
          "[driver] heartbeat error:",
          e instanceof Error ? e.message : e,
        );
      }
    };

    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOnline, ws]);
}
