/**
 * Rental marketplace WebSocket handler.
 * Maintains its OWN bidder socket registry (not the ride-hailing driver registry).
 * Fleet staff connect via auth:hello with any role; we resolve fleet_members on first message.
 *
 * WS is notification-only; REST is canonical (F25).
 */
import type { WebSocket } from "ws";
import { logger } from "../lib/logger";
import { db } from "../src/db";
import { fleetMembers } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

type SendFn = (ws: WebSocket, event: string, payload: unknown) => void;

// Bidder socket registry: Map<user_id, WebSocket>
const bidderSockets = new Map<string, WebSocket>();

/**
 * Register a bidder socket. Called on first rental:* message from a connection.
 */
export function registerBidder(userId: string, ws: WebSocket) {
  bidderSockets.set(userId, ws);
}

/**
 * Unregister a bidder socket on disconnect.
 */
export function unregisterBidder(userId: string) {
  bidderSockets.delete(userId);
}

/**
 * Get all connected bidder user IDs (for activation job broadcasts).
 */
export function getConnectedBidderIds(): string[] {
  return Array.from(bidderSockets.keys());
}

/**
 * Send a message to a specific bidder.
 */
export function sendToBidder(userId: string, event: string, payload: unknown): void {
  const ws = bidderSockets.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: event, ...(payload as Record<string, unknown>) }));
  }
}

/**
 * Send to all members of a fleet.
 */
export function sendToFleet(
  fleetId: string,
  event: string,
  payload: Record<string, unknown>,
  fleetMembers: Map<string, string[]>, // fleet_id → [user_ids]
) {
  const memberIds = fleetMembers.get(fleetId) ?? [];
  for (const userId of memberIds) {
    const ws = bidderSockets.get(userId);
    if (ws && ws.readyState === 1) {
      // OPEN
      ws.send(JSON.stringify({ type: event, ...payload }));
    }
  }
}

/**
 * Handle a rental-domain WS message.
 */
export async function handleRentalMessage(
  ws: WebSocket,
  event: string,
  payload: Record<string, unknown>,
  send: SendFn,
  metadata: { userId?: string },
) {
  const timeout = setTimeout(() => {
    logger.warn("[rentalHandler] handler timeout", { event });
  }, 5000);

  try {
    // §D membership resolution: register bidder on first rental:* message
    if (metadata.userId && !bidderSockets.has(metadata.userId)) {
      const [membership] = await db
        .select({ id: fleetMembers.id })
        .from(fleetMembers)
        .where(
          and(
            eq(fleetMembers.user_id, metadata.userId),
            eq(fleetMembers.status, "active"),
          ),
        )
        .limit(1);
      if (membership) {
        registerBidder(metadata.userId, ws);
      }
    }

    switch (event) {
      case "rental:bid_request":
        // S→C: broadcast a new rental request to eligible fleets
        send(ws, "rental:bid_request", payload);
        break;

      case "rental:new_bid":
        // S→C: notify customer of a new bid
        send(ws, "rental:new_bid", payload);
        break;

      case "rental:bid_won":
        // S→C: winning fleet notification (NO phone — F14)
        send(ws, "rental:bid_won", payload);
        break;

      case "rental:bid_settled":
        // S→C: all bidding fleets notified (F13)
        send(ws, "rental:bid_settled", payload);
        break;

      case "rental:driver_assigned":
        // S→C: customer + assigned driver get identity reveal (F14, ruling 7)
        send(ws, "rental:driver_assigned", payload);
        break;

      case "rental:fleet_ack":
        // S→C: tracking-fork acknowledgement to customer (F45)
        send(ws, "rental:fleet_ack", payload);
        break;

      case "rental:status":
        // S→C: status update to request owner + winning fleet members
        send(ws, "rental:status", payload);
        break;

      default:
        logger.warn("[rentalHandler] unknown event", { event });
    }
  } catch (err) {
    logger.error("[rentalHandler] handler error", { event, err });
  } finally {
    clearTimeout(timeout);
  }
}
