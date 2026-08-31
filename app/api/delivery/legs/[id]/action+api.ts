/**
 * POST /api/delivery/legs/[id]/action — courier performs leg actions (pickup, deliver, fail).
 * Courier-facing: must be the assigned courier.
 */
import { requireCourier } from '@/lib/marketplaceRbac';
import { db } from '@/src/db';
import { deliveryLegs, deliveryRequests, couriers } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const actionSchema = z.object({
  action: z.enum(['pickup', 'deliver', 'fail']),
  pod_url: z.string().url().optional(), // proof of delivery for 'deliver'
  failure_reason: z.string().optional(), // required for 'fail'
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid' }, { status: 400 });
    }

    const auth = await requireCourier('food')(request).catch(() => requireCourier('parcel')(request));

    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.ok) return parsed.response;
    const { action, pod_url, failure_reason } = parsed.data;

    // Find the leg
    const [leg] = await db
      .select()
      .from(deliveryLegs)
      .where(eq(deliveryLegs.id, id))
      .limit(1);

    if (!leg) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    if (leg.courier_user_id !== auth.dbUser.id) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    // Valid state transitions
    const validTransitions: Record<string, string[]> = {
      assigned: ['pickup'],
      pending: ['pickup'],
      picked_up: ['deliver', 'fail'],
      in_transit: ['deliver', 'fail'],
    };

    const currentState = leg.leg_state;
    if (!validTransitions[currentState]?.includes(action)) {
      return Response.json(
        { error: 'invalid_transition', message: `Cannot ${action} from ${currentState}` },
        { status: 409 },
      );
    }

    // Validate fail requires reason
    if (action === 'fail' && !failure_reason) {
      return Response.json({ error: 'failure_reason_required' }, { status: 400 });
    }
    // Validate deliver requires POD
    if (action === 'deliver' && !pod_url) {
      return Response.json({ error: 'pod_url_required' }, { status: 400 });
    }

    // Map action to leg_state
    const stateMap: Record<string, string> = {
      pickup: 'picked_up',
      deliver: 'delivered',
      fail: 'failed',
    };
    const newState = stateMap[action] as 'picked_up' | 'delivered' | 'failed';

    const updates: Record<string, unknown> = { leg_state: newState };
    if (action === 'pickup') updates.picked_up_at = new Date();
    if (action === 'deliver') {
      updates.delivered_at = new Date();
      updates.pod_url = pod_url;
    }
    if (action === 'fail') updates.failure_reason = failure_reason;

    await db.update(deliveryLegs)
      .set(updates)
      .where(eq(deliveryLegs.id, id));

    // Update delivery request status accordingly
    const requestUpdates: Record<string, unknown> = {};
    if (action === 'pickup') {
      requestUpdates.status = 'picked_up';
      requestUpdates.picked_up_at = new Date();
    } else if (action === 'deliver') {
      requestUpdates.status = 'delivered';
      requestUpdates.delivered_at = new Date();
      // Increment courier completed_count (F39 trust signal)
      await db.update(couriers)
        .set({ completed_count: sql`${couriers.completed_count} + 1` })
        .where(eq(couriers.user_id, auth.dbUser.id));
    } else if (action === 'fail') {
      requestUpdates.status = 'failed';
    }

    if (Object.keys(requestUpdates).length > 0) {
      await db.update(deliveryRequests)
        .set(requestUpdates)
        .where(eq(deliveryRequests.id, leg.request_id));
    }

    logger.info('Delivery leg action', { legId: id, action, courierId: auth.dbUser.id });

    return Response.json({ success: true, leg_state: newState });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return Response.json({ error: err.message || 'error' }, { status: err.status });
    }
    logger.error('Delivery leg action failed', error);
    return Response.json({ error: 'server_error', message: 'Leg action failed' }, { status: 500 });
  }
}
