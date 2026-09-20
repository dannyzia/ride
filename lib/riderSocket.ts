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

// Sockets the server has answered `auth:hello` with `auth:ok`.
//
// readyState alone is NOT proof of a working channel, and this is the bug the
// set exists to catch (device evidence 2026-09-20): connectRiderSocket puts the
// socket into the shared slot the moment it is constructed — before `onopen`,
// before `auth:hello`, before the server registers it — so a socket can be OPEN
// and look perfectly healthy to any readyState check while the server has no way
// to deliver a ride event to it. The WS server's /health read
// `connected_clients: 2, connected_riders: 0` while the rider sat on the
// searching screen: a connected client that was never a registered rider.
// `auth:ok` is the server's own confirmation that THIS socket is the one it
// forwards ride events to.
const authedSockets = new WeakSet<WebSocket>();

// When a socket opened. Used so a socket that is merely mid-handshake (auth:ok
// costs a supabase getUser round-trip) is not torn down by a liveness check.
const openedAt = new WeakMap<WebSocket, number>();
const AUTH_GRACE_MS = 10_000;

/** Parse a socket frame's `type` without throwing on non-JSON payloads. */
function readMessageType(data: unknown): string | null {
  try {
    const parsed = JSON.parse(String(data)) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : null;
  } catch {
    return null;
  }
}

/**
 * Whether the store slot's socket is a channel the server will deliver on.
 *
 * Consumers that WAIT on server events (the searching screen) must use this
 * rather than `ws != null` or `readyState`: an unregistered socket is silent in
 * exactly the same way an empty candidate pool is, and the two mean opposite
 * things to the rider.
 */
export function isRiderSocketReady(ws?: WebSocket | null): boolean {
  return ws != null && ws.readyState === WebSocket.OPEN && authedSockets.has(ws);
}

/**
 * A socket worth keeping: still handshaking, or OPEN and confirmed by the
 * server. Anything else — closed, closing, or open but never registered past the
 * grace window — is not a channel that can carry ride events and gets replaced.
 */
function isAdoptable(socket: WebSocket): boolean {
  if (socket.readyState === WebSocket.CONNECTING) return true;
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (authedSockets.has(socket)) return true;
  const opened = openedAt.get(socket);
  return opened !== undefined && Date.now() - opened < AUTH_GRACE_MS;
}

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
      openedAt.set(socket, Date.now());
      socket.send(
        JSON.stringify({ type: "auth:hello", access_token: token, role: "rider" }),
      );
    };
    // Attached with addEventListener, not onmessage: ride screens attach their
    // own message listeners (ride-tracking, finding-driver), and teardown
    // nulls onmessage — the handshake watch must survive both.
    socket.addEventListener("message", (event: MessageEvent) => {
      const type = readMessageType(event.data);
      if (type === "auth:ok") {
        authedSockets.add(socket);
      } else if (type === "auth:error") {
        // The server refused this handshake and leaves the socket open, so no
        // close event would ever arrive and nothing would replace it — the
        // rider would keep an OPEN socket that never delivers anything. Close
        // it ourselves so onclose runs the reconnect path (a fresh
        // getSession() also picks up a refreshed token).
        authedSockets.delete(socket);
        logger.warn("[riderSocket] handshake rejected — reconnecting");
        try {
          socket.close();
        } catch {
          // already closing
        }
      }
    });
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
    if (isAdoptable(existing)) {
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
      // Closed, closing, or OPEN but never registered with the server — not a
      // channel that can deliver ride events. Replace it.
      teardownRiderSocket();
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
