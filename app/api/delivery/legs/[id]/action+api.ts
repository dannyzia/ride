/**
 * POST /api/delivery/legs/[id]/action — courier performs leg actions (pickup, deliver, fail).
 * Courier-facing: must be the assigned courier with an ACTIVE couriers row.
 * A4 (+B5, audit #4/#29/#16): the leg update, the completed_count increment,
 * and the request update share ONE transaction; the leg row is locked with
 * FOR UPDATE and every write carries a conditional WHERE against the locked
 * state (0 rows ⇒ 409 concurrent_transition).
 */
import { requireCourier } from '@/lib/marketplaceRbac';
import { db } from '@/src/db';
import { deliveryLegs, deliveryRequests, couriers, deliveryStatusEnum } from '@/src/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import { logger } from '@/lib/logger';

type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];

const actionSchema = z.object({
  action: z.enum(['pickup', 'deliver', 'fail']),
  pod_url: z.string().url().optional(), // proof of delivery for 'deliver'
  failure_reason: z.string().optional(), // required for 'fail'
});

// Request statuses from which each leg action is valid (guards the request
// UPDATE; 0 rows ⇒ 409 concurrent_transition). pickup covers both the legacy
// 'pending' and the post-accept 'assigned' request state.
const REQUEST_STATES_FOR_ACTION: Record<string, DeliveryStatus[]> = {
  pickup: ['pending', 'assigned'],
  deliver: ['picked_up', 'in_transit'],
  fail: ['picked_up', 'in_transit'],
};

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid' }, { status: 400 });
    }

    const auth = await requireCourier('food')(request).catch(() => requireCourier('parcel')(request));

    // A4/B5: suspended courier defense-in-depth — fresh read of the couriers
    // row for the caller's type; requireCourier's own active check is
    // per-attempt, this one is authoritative for the matched type.
    const [courierRow] = await db
      .select({ status: couriers.status })
      .from(couriers)
      .where(
        and(
          eq(couriers.user_id, auth.dbUser.id),
          // requireCourier guarantees this literal is the matched type
          eq(couriers.courier_type, auth.courier.courier_type as 'food' | 'parcel'),
        ),
      )
      .limit(1);

    if (!courierRow || courierRow.status !== 'active') {
      return Response.json(
        { error: 'courier_suspended', message: 'Courier account is suspended' },
        { status: 403 },
      );
    }

    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.ok) return parsed.response;
    const { action, pod_url, failure_reason } = parsed.data;

    // Body-level validation (row-independent)
    if (action === 'fail' && !failure_reason) {
      return Response.json({ error: 'failure_reason_required' }, { status: 400 });
    }
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

    let guard: Response | null = null;
    await db.transaction(async (tx) => {
      // Lock the leg row; all checks below run against the LOCKED state.
      const legRows = await tx
        .select()
        .from(deliveryLegs)
        .where(eq(deliveryLegs.id, id))
        .limit(1)
        .for('update');

      const leg = legRows[0];
      if (!leg) {
        guard = Response.json({ error: 'not_found' }, { status: 404 });
        return;
      }
      if (leg.courier_user_id !== auth.dbUser.id) {
        guard = Response.json({ error: 'forbidden' }, { status: 403 });
        return;
      }

      // Valid state transitions (evaluated against the locked row)
      const validTransitions: Record<string, string[]> = {
        assigned: ['pickup'],
        pending: ['pickup'],
        picked_up: ['deliver', 'fail'],
        in_transit: ['deliver', 'fail'],
      };
      const currentState = leg.leg_state;
      if (!validTransitions[currentState]?.includes(action)) {
        guard = Response.json(
          { error: 'invalid_transition', message: `Cannot ${action} from ${currentState}` },
          { status: 409 },
        );
        return;
      }

      const legUpdates: Record<string, unknown> = { leg_state: newState, updated_at: new Date() };
      if (action === 'pickup') legUpdates.picked_up_at = new Date();
      if (action === 'deliver') {
        legUpdates.delivered_at = new Date();
        legUpdates.pod_url = pod_url;
      }
      if (action === 'fail') legUpdates.failure_reason = failure_reason;

      const updatedLeg = await tx
        .update(deliveryLegs)
        .set(legUpdates)
        .where(and(eq(deliveryLegs.id, id), eq(deliveryLegs.leg_state, currentState)))
        .returning({ id: deliveryLegs.id });

      if (updatedLeg.length === 0) {
        guard = Response.json(
          { error: 'concurrent_transition', message: 'Leg state changed concurrently' },
          { status: 409 },
        );
        return;
      }

      if (action === 'deliver') {
        // F39 trust signal — same tx as the leg write (audit #29)
        await tx
          .update(couriers)
          .set({ completed_count: sql`${couriers.completed_count} + 1`, updated_at: new Date() })
          .where(eq(couriers.user_id, auth.dbUser.id));
      }

      const requestUpdates: Record<string, unknown> = { updated_at: new Date() };
      if (action === 'pickup') {
        requestUpdates.status = 'picked_up';
        requestUpdates.picked_up_at = new Date();
      } else if (action === 'deliver') {
        requestUpdates.status = 'delivered';
        requestUpdates.delivered_at = new Date();
      } else {
        requestUpdates.status = 'failed';
      }

      const updatedRequest = await tx
        .update(deliveryRequests)
        .set(requestUpdates)
        .where(
          and(
            eq(deliveryRequests.id, leg.request_id),
            inArray(deliveryRequests.status, REQUEST_STATES_FOR_ACTION[action]),
          ),
        )
        .returning({ id: deliveryRequests.id });

      if (updatedRequest.length === 0) {
        guard = Response.json(
          { error: 'concurrent_transition', message: 'Request state changed concurrently' },
          { status: 409 },
        );
        return;
      }
    });

    if (guard) return guard;

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
