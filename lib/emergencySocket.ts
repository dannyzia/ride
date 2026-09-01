/**
 * Emergency WS helper (Phase 6) — driver-role socket for the ambulance
 * emergency feed. Mirrors lib/riderSocket.ts (single store slot, self-healing
 * exponential backoff). Emergency `emergency:new_request` broadcasts arrive
 * on any driver-role socket (utils-server sendToUser matches by users.id).
 */
import { useWSStore } from "@/store";
import { WS_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

let connecting: Promise<WebSocket | null> | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay =
    Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) +
    Math.random() * 1000;
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureEmergencySocket();
  }, delay);
}

async function connectEmergencySocket(): Promise<WebSocket | null> {
  let token: string | null = null;
  let userId: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
    userId = session?.user?.id ?? null;
  } catch (e) {
    logger.error("[emergencySocket] session fetch failed", e);
  }
  if (!token || !userId) return null;

  try {
    const socket = new WebSocket(WS_URL);
    useWSStore.getState().setWebSocket(socket, "driver", userId);
    socket.onopen = () => {
      reconnectAttempts = 0;
      socket.send(
        JSON.stringify({ type: "auth:hello", access_token: token, role: "driver" }),
      );
    };
    socket.onclose = () => {
      scheduleReconnect();
    };
    return socket;
  } catch (e) {
    logger.error("[emergencySocket] connect failed", e);
    scheduleReconnect();
    return null;
  }
}

/**
 * Ensure a live driver-role socket exists for emergency broadcasts.
 * Adopts only our own current-session socket (audit H-1).
 */
export async function ensureEmergencySocket(): Promise<WebSocket | null> {
  const state = useWSStore.getState();
  if (state.ws && state.socketRole === "driver") {
    if (
      state.ws.readyState === WebSocket.OPEN ||
      state.ws.readyState === WebSocket.CONNECTING
    ) {
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
        return state.ws;
      }
      teardownEmergencySocket();
    } else {
      useWSStore.getState().resetWebSocket();
    }
  } else if (state.ws) {
    teardownEmergencySocket();
  }
  if (connecting) return connecting;

  connecting = connectEmergencySocket().finally(() => {
    connecting = null;
  });
  return connecting;
}

export function teardownEmergencySocket(): void {
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

/** Send an emergency:* C→S event on the live socket. */
export function sendEmergencyMessage(message: Record<string, unknown>): boolean {
  const socket = useWSStore.getState().ws;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}
