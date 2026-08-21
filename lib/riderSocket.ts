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
  let userId: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
    userId = session?.user?.id ?? null;
  } catch (e) {
    logger.error("[riderSocket] session fetch failed", e);
  }
  if (!token || !userId) {
    // No session — nothing to connect with. Do NOT schedule a reconnect loop;
    // the next ensureRiderSocket() call (session start / tracking mount) is
    // the retry for the logged-out case.
    return null;
  }

  try {
    const socket = new WebSocket(WS_URL);
    // Tag the socket's owner so later adoption checks can reject a socket
    // left behind by another role or a previous sign-in (audit H-1).
    useWSStore.getState().setWebSocket(socket, "rider", userId);
    socket.onopen = () => {
      reconnectAttempts = 0;
      socket.send(
        JSON.stringify({ type: "auth:hello", access_token: token, role: "rider" }),
      );
    };
    socket.onclose = () => {
      scheduleReconnect();
    };
    return socket;
  } catch (e) {
    logger.error("[riderSocket] connect failed", e);
    scheduleReconnect();
    return null;
  }
}

/**
 * Sign-out / session-change teardown (audit H-1): stop the reconnect loop,
 * detach handlers, close whatever socket occupies the shared WS slot (the
 * slot is single — it may hold a rider OR driver socket after a role
 * switch), and clear the store. Called by authCleanup() on every sign-out
 * path and by ensureRiderSocket() when the slot holds a foreign socket.
 */
export function teardownRiderSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  const { ws } = useWSStore.getState();
  if (ws) {
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {
      // already closed / closing
    }
  }
  useWSStore.getState().resetWebSocket();
}

/** Return the live rider socket from the store, creating one if absent. */
export async function ensureRiderSocket(): Promise<WebSocket | null> {
  const state = useWSStore.getState();
  const existing = state.ws;
  if (existing && state.socketRole === "rider") {
    if (
      existing.readyState === WebSocket.OPEN ||
      existing.readyState === WebSocket.CONNECTING
    ) {
      // Adopt ONLY our own socket: it must belong to the current session's
      // user (audit H-1). A socket surviving from a previous sign-in is
      // torn down and replaced, never reused.
      let currentUserId: string | null = null;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        currentUserId = session?.user?.id ?? null;
      } catch {
        currentUserId = null;
      }
      if (currentUserId !== null && state.socketUserId === currentUserId) {
        return existing;
      }
      teardownRiderSocket();
    } else {
      // Closed/closing rider socket — clear the dead slot.
      useWSStore.getState().resetWebSocket();
    }
  } else if (existing) {
    // The slot holds a driver (or otherwise foreign) socket from a role
    // switch on the same device — replace it with a rider socket.
    teardownRiderSocket();
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
