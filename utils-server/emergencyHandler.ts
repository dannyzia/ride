/**
 * emergencyHandler.ts — `emergency:*` WS namespace (Phase 6, §D.2).
 *
 * C→S events delegate to emergencyChain (REST is canonical — F25; the chain
 * performs the §B.0 first-accept-wins tx and relays S→C updates to the
 * caller/assignee via sendToUser).
 *
 * S→C events (new_request/assigned/status/cancel) are sent by the chain and
 * emergencyActivation — this handler only processes driver-initiated ones.
 */
import type { WebSocket } from "ws";
import { logger } from "../lib/logger";

type SendFn = (ws: WebSocket, event: string, payload: unknown) => void;

interface EmergencyMessage {
  request_id?: string;
  status?: string;
  reason?: string;
}

const DRIVER_TRANSITIONS = new Set(["en_route_pickup", "arrived", "en_route_dropoff", "completed"]);

export async function handleEmergencyMessage(
  ws: WebSocket,
  event: string,
  payload: Record<string, unknown>,
  send: SendFn,
  metadata: { userId?: string },
): Promise<void> {
  const msg = payload as EmergencyMessage;
  const userId = metadata.userId;

  try {
    if (!userId) {
      send(ws, "error", { message: "not_authenticated" });
      return;
    }
    if (!msg.request_id) {
      send(ws, "error", { message: "request_id_required" });
      return;
    }

    // Lazy imports keep the module cycle emergencyHandler → emergencyChain →
    // index (sendToUser) → emergencyHandler (dynamic) non-blocking.
    const chain = await import("./emergencyChain");
    const { getVerifiedCertForUser } = await import("../lib/ambulanceCerts");
    const { db } = await import("../src/db");
    const { emergencyRequests } = await import("../src/db/schema");
    const { eq } = await import("drizzle-orm");

    switch (event) {
      case "emergency:accept": {
        const [req] = await db
          .select({ service_level: emergencyRequests.service_level, status: emergencyRequests.status })
          .from(emergencyRequests)
          .where(eq(emergencyRequests.id, msg.request_id))
          .limit(1);

        if (!req) {
          send(ws, "error", { message: "emergency_not_found" });
          return;
        }

        // §E.3 gate (WS form of requireAmbulanceCertified)
        const cert = req.service_level
          ? await getVerifiedCertForUser(userId, req.service_level)
          : null;
        if (!cert) {
          send(ws, "error", { message: "ambulance_certification_required" });
          return;
        }

        const updated = await chain.acceptEmergencyRequest(msg.request_id, cert.id, userId);
        send(ws, "emergency:accepted", {
          request_id: updated.id as string,
          status: updated.status as string,
        });
        break;
      }

      case "emergency:status": {
        if (!msg.status || !DRIVER_TRANSITIONS.has(msg.status)) {
          send(ws, "error", { message: "invalid_status" });
          return;
        }
        const updated = await chain.transitionEmergencyRequest(msg.request_id, userId, msg.status);
        send(ws, "emergency:status_ack", {
          request_id: updated.id as string,
          status: updated.status as string,
        });
        break;
      }

      case "emergency:cancel": {
        await chain.cancelEmergencyRequest(msg.request_id, userId, msg.reason);
        send(ws, "emergency:cancel_ack", { request_id: msg.request_id });
        break;
      }

      default:
        logger.warn("[emergencyHandler] unknown event", { event });
        send(ws, "error", { message: `unknown_event: ${event}` });
    }
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409) {
      send(ws, "error", { message: e.message || "conflict" });
      return;
    }
    if (e.status === 403) {
      send(ws, "error", { message: e.message || "forbidden" });
      return;
    }
    logger.error("[emergencyHandler] handler error", { event, err });
    send(ws, "error", { message: "emergency_handler_error" });
  }
}
