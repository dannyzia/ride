/**
 * wsNotify — Z2 fire-and-forget WS notifications from the API process.
 *
 * The WebSocket server is a separate process; the REST handlers cannot call
 * the in-memory socket registries directly. This helper POSTs a batch of
 * events to utils-server's /internal/ws/notify (WEBSOCKET_INTERNAL_SECRET
 * auth, same channel as the ride-cancel internal notify).
 *
 * Contract (Z2): emit AFTER the tx resolves; never throw — a WS outage must
 * not fail a successfully-committed DB transition.
 */
import { logger } from "@/lib/logger";

export type WsNotifyTarget =
  | { kind: "user"; user_id: string }
  | { kind: "fleet"; fleet_id: string }
  | { kind: "couriers" }
  | { kind: "shop_staff"; shop_id: string };

export interface WsNotifyEvent {
  event: string;
  to: WsNotifyTarget[];
  payload: Record<string, unknown>;
}

export function notifyWs(events: WsNotifyEvent[]): void {
  if (events.length === 0) return;
  const port = process.env.UTILS_SERVER_PORT ?? "3001";
  const secret = process.env.WEBSOCKET_INTERNAL_SECRET ?? "";
  if (!secret) {
    logger.warn("[wsNotify] WEBSOCKET_INTERNAL_SECRET unset — notification dropped", {
      events: events.map((e) => e.event),
    });
    return;
  }
  fetch(`http://127.0.0.1:${port}/internal/ws/notify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(3_000),
  })
    .then((r) => {
      if (!r.ok) {
        logger.warn("[wsNotify] notify rejected", { status: r.status });
      }
    })
    .catch((e: unknown) => {
      logger.warn("[wsNotify] notify failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    });
}
