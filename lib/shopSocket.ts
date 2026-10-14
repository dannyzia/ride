/**
 * Shop dashboard WebSocket (S3 §3 — "Realtime via WS").
 *
 * Connects with role "shop" (utils-server auth:hello) — any ACTIVE shop
 * member may hold a dashboard socket; the server registers it into the
 * per-user fan-out registry so internal notifications for kind 'user' and
 * kind 'shop_staff' both land here. REST stays canonical (F25): every event
 * this socket delivers is a hint to re-fetch, never a state mutation.
 *
 * Modeled on riderSocket (singleton + auth:ok confirmation + backoff
 * reconnect). The shop screens subscribe/unsubscribe per mount — no server
 * subscribe step exists; the send is a liveness no-op the server tolerates.
 */
import { useWSStore } from "@/store";
import { WS_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

let connecting: Promise<WebSocket | null> | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Sockets the server has answered `auth:hello` with `auth:ok`.
const authedSockets = new WeakSet<WebSocket>();

const openedAt = new WeakMap<WebSocket, number>();
const AUTH_GRACE_MS = 10_000;

/** Whether the socket is a server-confirmed shop channel. */
export function isShopSocketReady(ws?: WebSocket | null): boolean {
  return ws != null && ws.readyState === WebSocket.OPEN && authedSockets.has(ws);
}

function isAdoptable(socket: WebSocket): boolean {
  if (socket.readyState === WebSocket.CONNECTING) return true;
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (authedSockets.has(socket)) return true;
  const opened = openedAt.get(socket);
  return opened !== undefined && Date.now() - opened < AUTH_GRACE_MS;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay =
    Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) +
    Math.random() * 1000;
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureShopSocket();
  }, delay);
}

async function connectShopSocket(): Promise<WebSocket | null> {
  let token: string | null = null;
  let userId: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
    userId = session?.user?.id ?? null;
  } catch (e) {
    logger.error("[shopSocket] session fetch failed", e);
  }
  if (!token || !userId) {
    return null;
  }

  try {
    const socket = new WebSocket(WS_URL);
    useWSStore.getState().setWebSocket(socket, "shop", userId);
    socket.onopen = () => {
      reconnectAttempts = 0;
      openedAt.set(socket, Date.now());
      socket.send(
        JSON.stringify({ type: "auth:hello", access_token: token, role: "shop" }),
      );
    };
    socket.addEventListener("message", (event: MessageEvent) => {
      const type = readMessageType(event.data);
      if (type === "auth:ok") {
        authedSockets.add(socket);
      } else if (type === "auth:error") {
        // Handshake refused (e.g. membership revoked). Close so onclose runs
        // the reconnect path with a fresh token; do not loop forever on a
        // socket the server will never deliver on.
        authedSockets.delete(socket);
        logger.warn("[shopSocket] handshake rejected — reconnecting");
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
    logger.error("[shopSocket] connect failed", e);
    scheduleReconnect();
    return null;
  }
}

function readMessageType(data: unknown): string | null {
  try {
    const parsed = JSON.parse(String(data)) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : null;
  } catch {
    return null;
  }
}

export function teardownShopSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  const { ws, socketRole } = useWSStore.getState();
  // Only the socket the shop flow itself opened — the slot is shared with
  // rider/driver singletons, and tearing those down is THEIR job.
  if (ws && socketRole === "shop") {
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {
      // already closed / closing
    }
    useWSStore.getState().resetWebSocket();
  }
}

/** Return the live authenticated shop socket, creating one if absent. */
export async function ensureShopSocket(): Promise<WebSocket | null> {
  const state = useWSStore.getState();
  if (state.ws && state.socketRole === "shop") {
    if (isAdoptable(state.ws)) {
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
      teardownShopSocket();
    } else {
      teardownShopSocket();
    }
  } else if (state.ws) {
    // Foreign socket (rider/driver) — NOT ours to close; the shop screens
    // simply run without live updates until a shop mount owns the slot.
    logger.warn("[shopSocket] shared WS slot held by another role");
    return null;
  }
  if (connecting) return connecting;

  connecting = connectShopSocket().finally(() => {
    connecting = null;
  });
  return connecting;
}
