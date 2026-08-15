import { useWSStore } from "@/store";
import { WS_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Rider WebSocket singleton (L8 — one socket per role per session, mirrored on
// the driver side by driver home). The rider opens its socket once at session
// start (services-hub) and keeps it alive; ride screens subscribe/unsubscribe
// per ride. See utils-server/index.ts (`connectedRiders`, `ride:subscribe`).
//
// Self-healing: a dropped connection mid-ride must not silently freeze rider
// tracking. onclose schedules an exponential-backoff reconnect (same pattern
// as driver home). The fresh socket replaces the store one, which makes
// ride-tracking's `[ride_id, ws]` effect re-attach its listener; the server
// answers the new socket's `auth:hello` with `auth:ok`, and that listener
// re-sends `ride:subscribe` — the whole tracking loop restores without user
// action.

let connecting: Promise<WebSocket | null> | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s, plus jitter.
  const delay =
    Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) +
    Math.random() * 1000;
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureRiderSocket();
  }, delay);
}

async function connectRiderSocket(): Promise<WebSocket | null> {
  let token: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  } catch (e) {
    logger.error("[riderSocket] session fetch failed", e);
  }
  if (!token) {
    // No session — nothing to connect with. Do NOT schedule a reconnect loop;
    // the next ensureRiderSocket() call (session start / tracking mount) is
    // the retry for the logged-out case.
    return null;
  }

  try {
    const socket = new WebSocket(WS_URL);
    useWSStore.getState().setWebSocket(socket);
    socket.addEventListener("open", () => {
      reconnectAttempts = 0;
      socket.send(
        JSON.stringify({ type: "auth:hello", access_token: token, role: "rider" }),
      );
    });
    socket.addEventListener("close", () => {
      scheduleReconnect();
    });
    return socket;
  } catch (e) {
    logger.error("[riderSocket] connect failed", e);
    scheduleReconnect();
    return null;
  }
}

/** Return the live rider socket from the store, creating one if absent. */
export async function ensureRiderSocket(): Promise<WebSocket | null> {
  const existing = useWSStore.getState().ws;
  if (
    existing &&
    (existing.readyState === WebSocket.OPEN ||
      existing.readyState === WebSocket.CONNECTING)
  ) {
    return existing;
  }
  if (connecting) return connecting;

  connecting = connectRiderSocket().finally(() => {
    connecting = null;
  });
  return connecting;
}

/** Ask the server to forward this ride's events to the rider socket. */
export function subscribeRiderSocket(rideId: string): void {
  const socket = useWSStore.getState().ws;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "ride:subscribe", ride_id: rideId }));
  }
}

/** Stop forwarding this ride's events. */
export function unsubscribeRiderSocket(rideId: string): void {
  const socket = useWSStore.getState().ws;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "ride:unsubscribe", ride_id: rideId }));
  }
}
