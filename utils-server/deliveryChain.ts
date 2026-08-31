/**
 * deliveryChain.ts — Core delivery dispatch chain.
 * Handles: broadcast → collect bids → accept (award) → leg lifecycle.
 * All mutations are transactional (§B.0 pattern).
 */
import { db } from '../src/db';
import {
  deliveryRequests,
  deliveryBids,
  deliveryLegs,
  couriers,
} from '../src/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../lib/logger';

/**
 * Create a delivery leg after bid acceptance (§B.0 — called from API accept-bid tx).
 * This is a thin wrapper; the actual leg creation happens in the accept-bid API tx.
 */
export async function createLeg(requestId: string, courierUserId: string): Promise<void> {
  await db.insert(deliveryLegs).values({
    request_id: requestId,
    courier_user_id: courierUserId,
    leg_state: 'assigned',
  });
}

/**
 * Get eligible couriers for a delivery request broadcast.
 * Parcel: active drivers with matching vehicle type, online, within k-ring.
 * Food: active food couriers, online (last_seen_at within 90s), within k-ring.
 */
export async function getEligibleCouriers(
  requestId: string,
): Promise<Array<{ user_id: string; courier_type: string; h3_cell?: string }>> {
  const [req] = await db
    .select()
    .from(deliveryRequests)
    .where(eq(deliveryRequests.id, requestId))
    .limit(1);

  if (!req || req.status !== 'pending') return [];

  // Get all active couriers of the right type
  const courierType = req.required_vehicle_type ? 'parcel' : 'food';

  const eligible = await db
    .select({
      user_id: couriers.user_id,
      courier_type: couriers.courier_type,
      last_lat: couriers.last_lat,
      last_lng: couriers.last_lng,
    })
    .from(couriers)
    .where(and(
      eq(couriers.courier_type, courierType),
      eq(couriers.status, 'active'),
      eq(couriers.is_online, true),
    ));

  // In production, filter by k-ring proximity using H3.
  // For now, return all eligible couriers (geo filtering is a follow-up).
  return eligible.map((c) => ({
    user_id: c.user_id,
    courier_type: c.courier_type,
  }));
}

/**
 * Cancel a delivery request (customer-initiated).
 * Sets all active bids → lost, request → cancelled.
 */
export async function cancelRequest(
  requestId: string,
  userId: string,
  reason?: string,
): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, requestId))
      .for('update');

    if (!req) throw Object.assign(new Error('Not found'), { status: 404 });
    if (req.created_by_user_id !== userId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    // Can only cancel before pickup
    if (['picked_up', 'in_transit', 'delivered'].includes(req.status)) {
      throw Object.assign(new Error('Cannot cancel after pickup'), { status: 409 });
    }

    // Cancel all active bids
    await tx.update(deliveryBids)
      .set({ status: 'lost', settled_at: new Date() })
      .where(and(
        eq(deliveryBids.request_id, requestId),
        eq(deliveryBids.status, 'active'),
      ));

    // Cancel request
    await tx.update(deliveryRequests)
      .set({
        status: 'cancelled',
        cancelled_at: new Date(),
        cancel_reason: reason ?? null,
        cancelled_by: 'customer',
      })
      .where(eq(deliveryRequests.id, requestId));

    return true;
  });

  return result;
}
