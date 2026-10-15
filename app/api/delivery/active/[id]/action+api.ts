/**
 * POST /api/delivery/active/[id]/action — the S6 delivery-man leg lifecycle
 * (plan 27 §6.1 steps 6–7, F-15, F-33/F-38): attempt → pickup (code) →
 * deliver (proof + amount collected) | fail.
 *
 * A4/B5 transactional posture (same as the RFQ leg action): ONE transaction,
 * the leg row is locked FOR UPDATE, every write carries a conditional WHERE
 * against the locked state.
 *
 * Money (§12, in-tx): the delivered transition credits shop revenue
 * (lib/shopLedger — sole writer) AND settles the courier via
 * lib/deliverySettlement (earnings credit + COD remittance due, sole writer
 * of delivery_earnings / courier_remittance_dues). All three commit or roll
 * back together.
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { driverErrorCode } from '@/lib/idempotency';
import { parseJsonBody } from '@/lib/parseBody';
import { settleShopOrder } from '@/lib/shopLedger';
import { settleDeliveryLeg } from '@/lib/deliverySettlement';
import { db } from '@/src/db';
import {
  deliveries,
  shopOrders,
  shopMembers,
  shops,
  couriers,
} from '@/src/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { sendNotifications, type NotificationRequest } from '@/lib/notify';

const actionSchema = z
  .object({
    action: z.enum(['attempt', 'pickup', 'deliver', 'fail']),
    // pickup: the shop's handover code (F-11), required for shop-order legs.
    code: z.string().min(4).max(8).optional(),
    // deliver: proof — receiver OTP (F-15) OR photo (proof_photo_url).
    otp: z.string().min(4).max(8).optional(),
    proof_photo_url: z.string().url().optional(),
    // deliver: COD entry (F-38) — paisa actually received from the receiver.
    amount_collected_bdt: z.number().int().min(0).optional(),
    // fail: reason (required for fail).
    failure_reason: z.string().min(1).max(500).optional(),
  })
  .refine((d) => !(d.action === 'pickup') || !!d.code, {
    message: 'code is required for pickup',
  })
  .refine((d) => !(d.action === 'fail') || !!d.failure_reason, {
    message: 'failure_reason is required for fail',
  });

async function shopOrderRecipients(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  shopId: string,
): Promise<Set<string>> {
  const [shopRow, members] = await Promise.all([
    tx.select({ owner_user_id: shops.owner_user_id }).from(shops).where(eq(shops.id, shopId)).limit(1),
    tx
      .select({ user_id: shopMembers.user_id })
      .from(shopMembers)
      .where(and(eq(shopMembers.shop_id, shopId), isNull(shopMembers.removed_at))),
  ]);
  const recipients = new Set<string>(members.map((m) => m.user_id));
  if (shopRow[0]?.owner_user_id) recipients.add(shopRow[0].owner_user_id);
  return recipients;
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid leg id' }, { status: 400 });
    }

    const auth = await requireDeliveryAgent(request);
    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.ok) return parsed.response;
    const { action } = parsed.data;

    const notifies: NotificationRequest[] = [];
    let guard: Response | null = null;
    // Closure-assigned inside the tx; holder object avoids TS narrowing.
    const settlement: { value: Awaited<ReturnType<typeof settleDeliveryLeg>> } = { value: null };

    await db.transaction(async (tx) => {
      const [leg] = await tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, id))
        .limit(1)
        .for('update');

      if (!leg) {
        guard = Response.json({ error: 'not_found', message: 'Delivery not found' }, { status: 404 });
        return;
      }
      if (leg.delivery_man_user_id !== auth.dbUser.id) {
        guard = Response.json({ error: 'forbidden', message: 'Not the assigned courier' }, { status: 403 });
        return;
      }

      const [order] = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, leg.order_id))
        .limit(1);

      const now = new Date();

      if (action === 'attempt') {
        // F-15 attempted-delivery state (call → wait → return/second attempt).
        if (!['accepted', 'picked_up'].includes(leg.status)) {
          guard = Response.json(
            { error: 'invalid_transition', message: `Cannot attempt from ${leg.status}` },
            { status: 409 },
          );
          return;
        }
        await tx
          .update(deliveries)
          .set({
            attempt_count: leg.attempt_count + 1,
            attempted_at: now,
            updated_at: now,
          })
          .where(eq(deliveries.id, leg.id));
        return;
      }

      if (action === 'pickup') {
        if (leg.status !== 'accepted') {
          guard = Response.json(
            { error: 'invalid_transition', message: `Cannot pick up from ${leg.status}` },
            { status: 409 },
          );
          return;
        }
        if (!order) {
          guard = Response.json({ error: 'no_order', message: 'Handover codes are shop-order only' }, { status: 409 });
          return;
        }
        // F-11 handover: the courier must present the shop's pickup code.
        if (parsed.data.code !== order.pickup_code) {
          guard = Response.json({ error: 'pickup_code_mismatch', message: 'Wrong pickup code' }, { status: 409 });
          return;
        }
        // The shop must have marked the item ready first (§6.1 step 5–6).
        if (order.status !== 'ready_for_pickup') {
          guard = Response.json({ error: 'order_not_ready', message: 'Shop has not marked the item ready' }, { status: 409 });
          return;
        }
        await tx
          .update(deliveries)
          .set({ status: 'picked_up', picked_up_at: now, updated_at: now })
          .where(and(eq(deliveries.id, leg.id), eq(deliveries.status, 'accepted')));
        await tx
          .update(shopOrders)
          .set({ status: 'picked_up', picked_up_at: now, updated_at: now })
          .where(and(eq(shopOrders.id, order.id), eq(shopOrders.status, 'ready_for_pickup')));

        // §6.1 step 6: shop notified (handed over) + customer notified.
        for (const userId of await shopOrderRecipients(tx, order.shop_id)) {
          notifies.push({
            userId,
            type: 'shop:order_status',
            title: 'Item handed over',
            body: 'The courier picked up the item.',
            data: { order_id: order.id, status: 'picked_up' },
            priority: 'high',
            idempotencyKey: `shop_picked_up:${order.id}:${userId}`,
          });
        }
        notifies.push({
          userId: order.rider_user_id,
          type: 'shop:order_status',
          title: 'Order picked up',
          body: 'The courier picked up your order and is on the way.',
          data: { order_id: order.id, status: 'picked_up' },
          priority: 'high',
          idempotencyKey: `shop_order_status:${order.id}:picked_up:${order.rider_user_id}`,
        });
        return;
      }

      if (action === 'deliver') {
        if (leg.status !== 'picked_up') {
          guard = Response.json(
            { error: 'invalid_transition', message: `Cannot deliver from ${leg.status}` },
            { status: 409 },
          );
          return;
        }
        // F-15 proof: receiver OTP (shop-order legs) OR a proof photo.
        if (order) {
          const otpOk = !!parsed.data.otp && parsed.data.otp === order.delivery_otp;
          const photoOk = !!parsed.data.proof_photo_url;
          if (!otpOk && !photoOk) {
            guard = Response.json(
              { error: 'delivery_proof_required', message: 'Enter the receiver OTP or attach a proof photo' },
              { status: 400 },
            );
            return;
          }
        }
        // F-38: amount collected is mandatory COD evidence (short-pay lands on
        // the remittance due as recorded shortfall).
        if (order && parsed.data.amount_collected_bdt === undefined) {
          guard = Response.json(
            { error: 'amount_collected_required', message: 'Record the cash collected' },
            { status: 400 },
          );
          return;
        }

        await tx
          .update(deliveries)
          .set({
            status: 'delivered',
            delivered_at: now,
            proof_photo_url: parsed.data.proof_photo_url ?? leg.proof_photo_url,
            amount_collected_bdt: parsed.data.amount_collected_bdt ?? leg.amount_collected_bdt,
            amount_collected_at: parsed.data.amount_collected_bdt !== undefined ? now : leg.amount_collected_at,
            updated_at: now,
          })
          .where(and(eq(deliveries.id, leg.id), eq(deliveries.status, 'picked_up')));

        if (order) {
          await tx
            .update(shopOrders)
            .set({ status: 'delivered', delivered_at: now, updated_at: now })
            .where(and(eq(shopOrders.id, order.id), eq(shopOrders.status, 'picked_up')));
          // §12 money: shop revenue credit + courier earnings + COD due, ONE tx.
          await settleShopOrder(tx, order, { note: 'delivered (courier)' });
          settlement.value = await settleDeliveryLeg(tx, {
            legId: leg.id,
            orderId: order.id,
            courierUserId: auth.dbUser.id,
          });
        }

        // F-15 trust signal: delivery-men complete counters (drivers keep
        // ride counters separate).
        if (auth.kind === 'courier' && auth.courier) {
          await tx
            .update(couriers)
            .set({ completed_count: sql`${couriers.completed_count} + 1` })
            .where(eq(couriers.id, auth.courier.id));
        }

        if (order) {
          for (const userId of await shopOrderRecipients(tx, order.shop_id)) {
            notifies.push({
              userId,
              type: 'shop:order_status',
              title: 'Order delivered',
              body: 'The courier delivered the order.',
              data: { order_id: order.id, status: 'delivered' },
              priority: 'high',
              idempotencyKey: `shop_delivered:${order.id}:${userId}`,
            });
          }
          notifies.push({
            userId: order.rider_user_id,
            type: 'shop:order_status',
            title: 'Order delivered',
            body: 'Your order has been delivered. Pay cash on receipt.',
            data: { order_id: order.id, status: 'delivered' },
            priority: 'high',
            idempotencyKey: `shop_order_status:${order.id}:delivered:${order.rider_user_id}`,
          });
        }
        return;
      }

      // action === 'fail'
      if (!['accepted', 'picked_up'].includes(leg.status)) {
        guard = Response.json(
          { error: 'invalid_transition', message: `Cannot fail from ${leg.status}` },
          { status: 409 },
        );
        return;
      }
      await tx
        .update(deliveries)
        .set({ status: 'failed', updated_at: now })
        .where(and(eq(deliveries.id, leg.id), eq(deliveries.status, leg.status)));
      if (order) {
        // The order returns to the shop's F-12 fallback (retry / self-deliver
        // / cancel) — status untouched, both parties notified below.
        for (const userId of await shopOrderRecipients(tx, order.shop_id)) {
          notifies.push({
            userId,
            type: 'shop:delivery_exhausted',
            title: 'Delivery failed',
            body: 'The courier could not deliver. Retry, deliver it yourself, or cancel.',
            data: { order_id: order.id, leg_id: leg.id, reason: parsed.data.failure_reason ?? '' },
            priority: 'high',
            idempotencyKey: `shop_delivery_failed:${order.id}:${leg.id}`,
          });
        }
        notifies.push({
          userId: order.rider_user_id,
          type: 'shop:order_status',
          title: 'Delivery attempt failed',
          body: 'The courier could not deliver your order. The shop is arranging the next step.',
          data: { order_id: order.id, status: 'delivery_failed' },
          priority: 'high',
          idempotencyKey: `shop_order_status:${order.id}:delivery_failed:${order.rider_user_id}`,
        });
      }
    });

    if (guard) return guard;
    if (notifies.length > 0) await sendNotifications(notifies).catch(() => {});

    return Response.json(
      {
        success: true,
        action,
        settlement: settlement.value
          ? { earned_bdt: settlement.value.earned_bdt, commission_bdt: settlement.value.commission_bdt, due_bdt: settlement.value.due_bdt }
          : null,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    if (status === 403) {
      return Response.json({ error: 'forbidden', message: 'Not an active delivery agent' }, { status: 403 });
    }
    if (driverErrorCode(err) === '23505') {
      // active-claimer index — one active job at a time.
      return Response.json(
        { error: 'already_claimed', message: 'You already hold an active delivery' },
        { status: 409 },
      );
    }
    logger.error('[delivery/active/action] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}


