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
} from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

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

// B5-1 (plan 27 §6.1): getEligibleCouriers deleted — dead since the
// courier-bidding broadcast died (no callers; the job-55 broadcast arm +
// WS lane are gone). Eligibility now lives in lib/deliveryDispatch.ts
// (sequential §6.1 dispatch over the deliveries legs table).

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
