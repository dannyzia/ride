import { useWSStore } from "@/store";
import { WS_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Rider WebSocket singleton (L8 — one socket per role per session, mirrored on
// the driver side by driver home). The rider opens its socket once at session
// start (services-hub) and keeps it alive; ride screens subscribe/unsubscribe
// per ride. See utils-server/index.ts (`connectedRiders`, `ride:subscribe`).

let connecting: Promise<WebSocket | null> | null = null;

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

  connecting = (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;

      const socket = new WebSocket(WS_URL);
      useWSStore.getState().setWebSocket(socket);
      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({ type: "auth:hello", access_token: token, role: "rider" }),
        );
      });
      return socket;
    } catch (e) {
      logger.error("[riderSocket] connect failed", e);
      return null;
    } finally {
      connecting = null;
    }
  })();
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
