/**
 * Shop marketplace WebSocket handler.
 * Handles shop:order_status, shop:rfq_quote, shop:new_rfq events.
 * WS is notification-only; REST is the source of truth (F25).
 */
import type { WebSocket } from "ws";
import { logger } from "../lib/logger";

type SendFn = (ws: WebSocket, event: string, payload: unknown) => void;

/**
 * Thin WS dispatcher — each handler delegates to the same transactional
 * function the REST route uses. REST canonical; WS notification.
 * Per-handler try/catch + timeout wrapper isolates marketplace bugs
 * from ride-hailing sockets.
 */
export function handleShopMessage(
  ws: WebSocket,
  event: string,
  payload: Record<string, unknown>,
  send: SendFn,
) {
  const timeout = setTimeout(() => {
    logger.warn("[shopHandler] handler timeout", { event });
  }, 5000);

  try {
    switch (event) {
      case "shop:order_status":
        handleOrderStatus(ws, payload, send);
        break;
      case "shop:rfq_quote":
        handleRfqQuote(ws, payload, send);
        break;
      case "shop:new_rfq":
        handleNewRfq(ws, payload, send);
        break;
      case "shop:delivery_created":
        handleDeliveryCreated(ws, payload, send);
        break;
      default:
        logger.warn("[shopHandler] unknown event", { event });
    }
  } catch (err) {
    logger.error("[shopHandler] handler error", { event, err });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Notify shop members that an order status changed.
 * Sent after PATCH /api/shop/orders/[id]/status succeeds.
 */
function handleOrderStatus(
  ws: WebSocket,
  payload: Record<string, unknown>,
  send: SendFn,
) {
  // WS notification only — the REST handler already wrote to DB.
  // Fan-out to connected shop members happens via the caller.
  send(ws, "shop:order_status", {
    order_id: payload.order_id,
    status: payload.status,
    shop_id: payload.shop_id,
  });
}

/**
 * Notify customer that shop has quoted on their RFQ.
 */
function handleRfqQuote(
  ws: WebSocket,
  payload: Record<string, unknown>,
  send: SendFn,
) {
  send(ws, "shop:rfq_quote", {
    rfq_id: payload.rfq_id,
    quoted_price_bdt: payload.quoted_price_bdt,
    quoted_notes: payload.quoted_notes,
  });
}

/**
 * Broadcast new RFQ to shop members.
 */
function handleNewRfq(
  ws: WebSocket,
  payload: Record<string, unknown>,
  send: SendFn,
) {
  send(ws, "shop:new_rfq", {
    rfq_id: payload.rfq_id,
    shop_id: payload.shop_id,
    title: payload.title,
  });
}

/**
 * Notify customer that a delivery has been created from their food order (F24).
 */
function handleDeliveryCreated(
  ws: WebSocket,
  payload: Record<string, unknown>,
  send: SendFn,
) {
  send(ws, "shop:delivery_created", {
    order_id: payload.order_id,
    delivery_request_id: payload.delivery_request_id,
  });
}
