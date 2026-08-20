import { WS_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Admin WebSocket singleton (F-15 — mirrors lib/riderSocket.ts). The admin
// dashboard opens one socket per page and receives `admin:sos` broadcasts
// pushed from POST /api/sos/alert via the WS server's /internal/sos/alert
// endpoint. Like riderSocket, this file deliberately does NOT import WS types
// from utils-server (cross-package); the alert payload is declared locally as
// a structural interface instead.

export interface SosAlert {
  id: string;
  user_id: string;
  role: string;
  latitude: string;
  longitude: string;
  message: string | null;
  ride_id: string | null;
  created_at: string;
}

type AlertListener = (alert: SosAlert) => void;

// Multiple subscribers share one socket; unsubscribe just removes the
// listener (the socket stays alive for the page, like riderSocket's store-held
// socket stays alive for the session).
const listeners = new Set<AlertListener>();

let socket: WebSocket | null = null;
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
    ensureConnected();
  }, delay);
}

function isSosAlert(value: unknown): value is SosAlert {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.user_id === "string" &&
    typeof v.role === "string" &&
    typeof v.latitude === "string" &&
    typeof v.longitude === "string" &&
    (v.message === null || typeof v.message === "string") &&
    (v.ride_id === null || typeof v.ride_id === "string") &&
    typeof v.created_at === "string"
  );
}

function attachListeners(sock: WebSocket): void {
  sock.addEventListener("message", (event) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const record = msg as Record<string, unknown>;
    if (record.type === "admin:sos" && isSosAlert(record.alert)) {
      for (const listener of listeners) {
        try {
          listener(record.alert);
        } catch (e) {
          logger.error("[adminSocket] listener failed", e);
        }
      }
    } else if (record.type === "auth:error") {
      // Close so the reconnect path retries with a fresh token
      // (auth:error alone leaves the socket open and idle).
      logger.error("[adminSocket] auth rejected", { message: record.message });
      sock.close();
    }
    // All other message types (auth:ok, unknown) are ignored.
  });
}

async function connectAdminSocket(): Promise<WebSocket | null> {
  let token: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  } catch (e) {
    logger.error("[adminSocket] session fetch failed", e);
  }
  if (!token) {
    // No session — nothing to connect with. Do NOT schedule a reconnect loop;
    // the next ensureAdminSocket() call (screen mount) is the retry for the
    // logged-out case.
    return null;
  }

  try {
    const sock = new WebSocket(WS_URL);
    sock.addEventListener("open", () => {
      reconnectAttempts = 0;
      sock.send(
        JSON.stringify({ type: "auth:hello", access_token: token, role: "admin" }),
      );
    });
    sock.addEventListener("close", () => {
      if (socket === sock) socket = null;
      scheduleReconnect();
    });
    attachListeners(sock);
    socket = sock;
    return sock;
  } catch (e) {
    logger.error("[adminSocket] connect failed", e);
    scheduleReconnect();
    return null;
  }
}

function ensureConnected(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (connecting) return;
  connecting = connectAdminSocket().finally(() => {
    connecting = null;
  });
}

/**
 * Subscribe to live SOS alerts, connecting the admin socket if needed.
 * Returns an unsubscribe function. Multiple subscribers are supported.
 */
export function ensureAdminSocket(onAlert: AlertListener): () => void {
  listeners.add(onAlert);
  ensureConnected();
  return () => {
    listeners.delete(onAlert);
  };
}
