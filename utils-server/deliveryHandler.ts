/**
 * deliveryHandler.ts — Courier socket registry + presence updates for delivery marketplace.
 * Maintains courier presence (is_online/last_seen_at/last_lat/last_lng) for food heroes.
 * Presence writes are throttled: ≥15s per courier or 100m+ position change.
 */
import type { WebSocket } from 'ws';
import { db } from '../src/db';
import { couriers } from '../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../lib/logger';

// Courier socket registry — Map<userId, WebSocket>
const courierSockets = new Map<string, WebSocket>();

// Presence throttle state — Map<userId, { lastFlush, lastLat, lastLng }>
const presenceState = new Map<string, { lastFlush: number; lastLat: number; lastLng: number }>();

const PRESENCE_THROTTLE_MS = 15_000; // 15 seconds
const PRESENCE_DISTANCE_M = 100; // 100 meters
const PRESENCE_STALE_MS = 90_000; // 90 seconds — offline threshold

/**
 * Register a courier's WebSocket connection.
 */
export function registerCourier(userId: string, ws: WebSocket): void {
  courierSockets.set(userId, ws);
  // Mark online on connect
  db.update(couriers)
    .set({ is_online: true, last_seen_at: new Date() })
    .where(eq(couriers.user_id, userId))
    .catch((err: unknown) => logger.error('Courier presence update failed', err));
}

/**
 * Unregister a courier's WebSocket connection.
 */
export function unregisterCourier(userId: string): void {
  courierSockets.delete(userId);
  presenceState.delete(userId);
  // Mark offline on disconnect
  db.update(couriers)
    .set({ is_online: false })
    .where(eq(couriers.user_id, userId))
    .catch((err: unknown) => logger.error('Courier presence offline failed', err));
}

/**
 * Handle courier heartbeat — updates presence with throttling.
 */
export function handleHeartbeat(userId: string, lat: number, lng: number): void {
  const now = Date.now();
  const prev = presenceState.get(userId);

  // Throttle: skip if last flush was < 15s ago AND position change < 100m
  if (prev) {
    const timeSinceFlush = now - prev.lastFlush;
    const distM = haversineDistance(prev.lastLat, prev.lastLng, lat, lng);
    if (timeSinceFlush < PRESENCE_THROTTLE_MS && distM < PRESENCE_DISTANCE_M) {
      return; // throttled
    }
  }

  // Flush to DB
  presenceState.set(userId, { lastFlush: now, lastLat: lat, lastLng: lng });
  db.update(couriers)
    .set({
      is_online: true,
      last_lat: String(lat),
      last_lng: String(lng),
      last_seen_at: new Date(),
    })
    .where(eq(couriers.user_id, userId))
    .catch((err: unknown) => logger.error('Courier heartbeat flush failed', err));
}

/**
 * Sweep stale couriers — mark offline if last_seen_at > 90s ago.
 * Called periodically by scheduler job 52.
 */
export async function sweepStaleCouriers(): Promise<number> {
  const staleThreshold = new Date(Date.now() - PRESENCE_STALE_MS);
  const result = await db
    .update(couriers)
    .set({ is_online: false })
    .where(and(
      eq(couriers.is_online, true),
      sql`${couriers.last_seen_at} < ${staleThreshold}`,
    ));
  // Drizzle's update().where() returns RowList; rowCount is on the driver result
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Get connected courier count.
 */
export function getConnectedCourierCount(): number {
  return courierSockets.size;
}

/**
 * Send message to a specific courier.
 */
export function sendToCourier(userId: string, event: string, payload: unknown): void {
  const ws = courierSockets.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ event, ...(payload as Record<string, unknown>) }));
  }
}

/**
 * Broadcast to all connected couriers matching a filter.
 */
export function broadcastToCouriers(
  event: string,
  payload: unknown,
  filter?: (userId: string) => boolean,
): void {
  const message = JSON.stringify({ event, ...(payload as Record<string, unknown>) });
  for (const [userId, ws] of courierSockets) {
    if (ws.readyState === 1 && (!filter || filter(userId))) {
      ws.send(message);
    }
  }
}

// ── Helpers ──

/**
 * Handle delivery WebSocket messages.
 */
export function handleDeliveryMessage(
  ws: WebSocket,
  event: string,
  payload: Record<string, unknown>,
  send: (target: WebSocket, event: string, payload: unknown) => void,
): void {
  switch (event) {
    case "delivery:heartbeat": {
      const { userId, lat, lng } = payload as { userId: string; lat: number; lng: number };
      if (userId && typeof lat === 'number' && typeof lng === 'number') {
        handleHeartbeat(userId, lat, lng);
      }
      break;
    }
    case "delivery:connect": {
      const { userId } = payload as { userId: string };
      if (userId) {
        registerCourier(userId, ws);
      }
      break;
    }
    default:
      logger.warn("[ws] unknown delivery event", { event });
  }
}

// ── Helpers ──

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
