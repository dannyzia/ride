/**
 * POST /api/delivery/offers/[id]/respond — accept or reject THE dispatched
 * offer (plan 27 §6.1 sequential single-offer dispatch).
 *
 * Single-claim, race-safe for BOTH roles: the leg is locked FOR UPDATE, the
 * claim is a conditional UPDATE on status='offered', and the partial unique
 * index (deliveries_active_claimer_uidx: one accepted/picked_up leg per
 * claimer) is the DB backstop — a 23505 there answers 409 already_claimed.
 *
 * Accept (§6.1 step 4): shop notified (courier assigned) + customer notified;
 * the shop order gains courier_user_id, courier_assigned_at and the F-11
 * handover codes (pickup_code shop→courier, delivery_otp courier→customer —
 * never returned to the courier here).
 * Reject: the offer clears and the next tick dispatches the NEXT ranked
 * candidate (tried candidates are never re-offered — persisted tried set).
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { courierDebtHoldsDispatch } from '@/lib/deliverySettlement';
import { driverErrorCode } from '@/lib/idempotency';
import { parseJsonBody } from '@/lib/parseBody';
import { db } from '@/src/db';
import { deliveries, shopOrders, shopMembers, shops } from '@/src/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { sendNotifications, type NotificationRequest } from '@/lib/notify';

const respondSchema = z.object({
  decision: z.enum(['accept', 'reject']),
});

function sixDigitCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid leg id' }, { status: 400 });
    }

    const auth = await requireDeliveryAgent(request);
    const parsed = await parseJsonBody(request, respondSchema);
    if (!parsed.ok) return parsed.response;
    const { decision } = parsed.data;

    // F-33 dispatch hold: an agent with overdue COD dues cannot accept
    // (reject is always allowed — declining frees the chain).
    if (decision === 'accept' && (await courierDebtHoldsDispatch(auth.dbUser.id))) {
      return Response.json(
        { error: 'dispatch_hold_active', message: 'Outstanding COD remittance dues block new deliveries' },
        { status: 403 },
      );
    }

    const notifies: NotificationRequest[] = [];
    let guard: Response | null = null;

    await db.transaction(async (tx) => {
      const [leg] = await tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, id))
        .limit(1)
        .for('update');

      if (!leg) {
        guard = Response.json({ error: 'not_found', message: 'Offer not found' }, { status: 404 });
        return;
      }
      if (leg.status !== 'offered' || leg.offered_to_user_id !== auth.dbUser.id) {
        guard = Response.json(
          { error: 'offer_unavailable', message: 'This offer is no longer available' },
          { status: 409 },
        );
        return;
      }
      if (leg.offer_expires_at && leg.offer_expires_at.getTime() <= Date.now()) {
        guard = Response.json(
          { error: 'offer_expired', message: 'The offer window has elapsed' },
          { status: 409 },
        );
        return;
      }

      if (decision === 'reject') {
        // Chain advance happens on the dispatch tick (5s); tried set persists.
        await tx
          .update(deliveries)
          .set({
            status: 'created',
            offered_to_user_id: null,
            offer_expires_at: null,
            updated_at: new Date(),
          })
          .where(and(eq(deliveries.id, id), eq(deliveries.status, 'offered')));
        return;
      }

      // ── ACCEPT — single claim (§6.1 step 4) ──────────────────────────────
      let claimed;
      try {
        claimed = await tx
          .update(deliveries)
          .set({
            delivery_man_user_id: auth.dbUser.id,
            status: 'accepted',
            accepted_at: new Date(),
            offered_to_user_id: null,
            offer_expires_at: null,
            updated_at: new Date(),
          })
          .where(and(eq(deliveries.id, id), eq(deliveries.status, 'offered')))
          .returning({ id: deliveries.id });
      } catch (e: unknown) {
        // deliveries_active_claimer_uidx: the claimer already holds an
        // active leg (one active job at a time, both roles).
        if (driverErrorCode(e) === '23505') {
          guard = Response.json(
            { error: 'already_claimed', message: 'You already hold an active delivery' },
            { status: 409 },
          );
          return;
        }
        throw e;
      }
      if (claimed.length === 0) {
        guard = Response.json(
          { error: 'concurrent_transition', message: 'Offer already resolved' },
          { status: 409 },
        );
        return;
      }

      // Shop-order linkage: courier pointer + F-11 handover codes.
      const [order] = await tx
        .select({
          id: shopOrders.id,
          shop_id: shopOrders.shop_id,
          rider_user_id: shopOrders.rider_user_id,
          status: shopOrders.status,
        })
        .from(shopOrders)
        .where(eq(shopOrders.id, leg.order_id))
        .limit(1);

      if (order) {
        const pickupCode = sixDigitCode();
        const deliveryOtp = sixDigitCode();
        await tx
          .update(shopOrders)
          .set({
            courier_user_id: auth.dbUser.id,
            courier_assigned_at: new Date(),
            pickup_code: pickupCode,
            delivery_otp: deliveryOtp,
            // §6.1 step 4: the order enters the assignment state from the
            // dispatching states (preparing = auto-triggered search,
            // dispatched = shop-triggered search).
            status: 'courier_assigned',
            updated_at: new Date(),
          })
          .where(
            and(
              eq(shopOrders.id, order.id),
              inArrayStatusPrep(),
            ),
          );

        // §6.1 step 4 notifications: shop + customer, after the commit below.
        const [shopRow, members] = await Promise.all([
          tx.select({ owner_user_id: shops.owner_user_id }).from(shops).where(eq(shops.id, order.shop_id)).limit(1),
          tx
            .select({ user_id: shopMembers.user_id })
            .from(shopMembers)
            .where(and(eq(shopMembers.shop_id, order.shop_id), isNull(shopMembers.removed_at))),
        ]);
        const shopRecipients = new Set(members.map((m) => m.user_id));
        if (shopRow[0]?.owner_user_id) shopRecipients.add(shopRow[0].owner_user_id);
        for (const userId of shopRecipients) {
          notifies.push({
            userId,
            type: 'shop:order_status',
            title: 'Courier assigned',
            body: 'A courier accepted the delivery — hand over the item with the pickup code.',
            data: { order_id: order.id, status: 'courier_assigned' },
            priority: 'high',
            idempotencyKey: `shop_courier_assigned:${order.id}:${userId}`,
          });
        }
        notifies.push({
          userId: order.rider_user_id,
          type: 'shop:order_status',
          title: 'Courier assigned',
          body: 'A courier is on the way for your order.',
          data: { order_id: order.id, status: 'courier_assigned' },
          priority: 'high',
          idempotencyKey: `shop_order_status:${order.id}:courier_assigned:${order.rider_user_id}`,
        });
      }
    });

    if (guard) return guard;
    if (notifies.length > 0) await sendNotifications(notifies).catch(() => {});

    return Response.json({ success: true, decision }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    if (status === 403) {
      return Response.json({ error: 'forbidden', message: 'Not an active delivery agent' }, { status: 403 });
    }
    logger.error('[delivery/offers/respond] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}

/** SQL predicate: the order must still be awaiting courier assignment. */
function inArrayStatusPrep() {
  return sql`${shopOrders.status} IN ('preparing', 'dispatched')`;
}
