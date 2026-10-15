/**
 * Marketplace ORDER BROWSER (plan 27 §7 A1).
 *
 *   GET  /api/admin/marketplace/orders — read-across every shop order/booking
 *        (the sidebar's list filter set: state, shop, customer, courier, date).
 *   POST /api/admin/marketplace/orders — { action: 'force_cancel' } with a
 *        REQUIRED reason code: the dispute path. Read-only otherwise — there is
 *        deliberately no live-order editing action on this route.
 *
 * Auth: requireAdminPermission('marketplace.write') (owner, admin) for both, per
 * §7 A2 — the queues default ops_manager/moderator to read-only, and this
 * surface's only action is a money-path decision, so it stays owner/admin.
 *
 * force_cancel semantics (§7 A1 + A3, plan lines 195/197/276 + F-31):
 *   * the reason code is REQUIRED (Zod enum) and lands on the order's
 *     cancel_reason as `admin:<code>`, so the free-text customer/shop reasons
 *     stay distinguishable in the data;
 *   * money that already moved is REVERSED, append-only, via
 *     lib/shopLedger.reverseShopOrder — never by editing the original rows
 *     ("where money moved": an order that never settled writes no reversal);
 *   * the customer is notified WITH the reason (lib/shopNotify);
 *   * every force-cancel writes audit_logs (A3);
 *   * live delivery legs are failed so a cancelled order can never hold a chain.
 *
 * State rule (derived from the shop_order_status enum + the settlement point,
 * not invented): a settled order (delivered | self_delivered | done) becomes
 * `refunded` and its ledger is reversed; anything not already
 * cancelled/refunded becomes `cancelled`, with stock restored only when the
 * goods never left the shop.
 */
import { z } from 'zod';
import { and, desc, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { shopOrders, shopOrderItems, shopProducts, shops, users, deliveries } from '@/src/db/schema';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { writeAudit } from '@/lib/auditLog';
import { reverseShopOrder } from '@/lib/shopLedger';
import { CUSTOMER_CANCELLABLE_STATES } from '@/lib/shopOrderCancel';
import { notifyCustomerForceCancel } from '@/lib/shopNotify';
import { notifyWs } from '@/lib/wsNotify';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

/** The reason-code vocabulary is the A1 contract: machine-stable, auditable. */
export const FORCE_CANCEL_REASON_CODES = [
  'customer_request',
  'shop_unable_to_fulfil',
  'stock_unavailable',
  'dispute_resolved',
  'fraud_suspected',
  'payment_failure',
  'duplicate_order',
  'other',
] as const;

/** States whose money has already moved (settleShopOrder ran) → reversible. */
const SETTLED_STATES = ['delivered', 'self_delivered', 'done'] as const;
/** Already decided — a second force-cancel is a 409, never a second reversal. */
const RESOLVED_STATES = ['cancelled', 'refunded'] as const;

const listSchema = z.object({
  status: z.string().max(30).optional(),
  shop_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  courier_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const actionSchema = z.object({
  action: z.literal('force_cancel'),
  order_id: z.string().uuid(),
  reason_code: z.enum(FORCE_CANCEL_REASON_CODES),
  reason_text: z.string().max(500).optional(),
  internal_note: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('marketplace.write')(request);

    const url = new URL(request.url);
    const parsed = listSchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      shop_id: url.searchParams.get('shop_id') ?? undefined,
      customer_id: url.searchParams.get('customer_id') ?? undefined,
      courier_id: url.searchParams.get('courier_id') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(
        { error: 'invalid_param', message: 'Invalid query parameters' },
        { status: 400 },
      );
    }
    const { status, shop_id, customer_id, courier_id, from, to, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [
      status ? eq(shopOrders.status, status as typeof shopOrders.status.enumValues[number]) : undefined,
      shop_id ? eq(shopOrders.shop_id, shop_id) : undefined,
      customer_id ? eq(shopOrders.rider_user_id, customer_id) : undefined,
      courier_id ? eq(shopOrders.courier_user_id, courier_id) : undefined,
      from ? gte(shopOrders.created_at, new Date(from)) : undefined,
      to ? lte(shopOrders.created_at, new Date(to)) : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: shopOrders.id,
        status: shopOrders.status,
        order_kind: shopOrders.order_kind,
        fulfillment: shopOrders.fulfillment,
        category: shopOrders.category,
        shop_id: shopOrders.shop_id,
        shop_name: shops.name,
        rider_user_id: shopOrders.rider_user_id,
        customer_name: users.name,
        customer_phone: users.phone,
        courier_user_id: shopOrders.courier_user_id,
        subtotal_bdt: shopOrders.subtotal_bdt,
        delivery_fee_bdt: shopOrders.delivery_fee_bdt,
        total_bdt: shopOrders.total_bdt,
        cancel_reason: shopOrders.cancel_reason,
        created_at: shopOrders.created_at,
        delivered_at: shopOrders.delivered_at,
      })
      .from(shopOrders)
      .innerJoin(shops, eq(shops.id, shopOrders.shop_id))
      .innerJoin(users, eq(users.id, shopOrders.rider_user_id))
      .where(where)
      .orderBy(desc(shopOrders.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shopOrders)
      .where(where);

    return Response.json({
      orders: rows,
      total: countResult?.count ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Admin access required' }, { status: 403 });
    logger.error('[admin/marketplace/orders] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission('marketplace.write')(request);

    const result = await parseJsonBody(request, actionSchema);
    if (!result.ok) return result.response;
    const { order_id, reason_code, reason_text, internal_note } = result.data;

    const ip = request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers?.get('user-agent') ?? null;

    let guard: Response | null = null;
    let newStatus = 'cancelled';
    let prevStatus = '';
    let reversedBdt = 0;
    let customerId = '';

    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, order_id))
        .limit(1)
        .for('update');

      const order = orderRows[0];
      if (!order) {
        guard = Response.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
        return;
      }
      customerId = order.rider_user_id;
      prevStatus = order.status;

      if ((RESOLVED_STATES as readonly string[]).includes(order.status)) {
        guard = Response.json(
          { error: 'already_resolved', message: `Order is already ${order.status}` },
          { status: 409 },
        );
        return;
      }

      const settled = (SETTLED_STATES as readonly string[]).includes(order.status);
      newStatus = settled ? 'refunded' : 'cancelled';

      const cancelReason = reason_text
        ? `admin:${reason_code} — ${reason_text}`
        : `admin:${reason_code}`;

      const updated = await tx
        .update(shopOrders)
        .set({
          status: newStatus as typeof shopOrders.status.enumValues[number],
          cancelled_at: new Date(),
          cancel_reason: cancelReason,
          updated_at: new Date(),
        })
        .where(and(eq(shopOrders.id, order_id), eq(shopOrders.status, order.status)))
        .returning({ id: shopOrders.id });

      if (updated.length === 0) {
        guard = Response.json(
          { error: 'invalid_transition', message: 'Order state changed — refresh and retry' },
          { status: 409 },
        );
        return;
      }

      // Restock ONLY when the goods never left the shop: the placement tx
      // deducted stock, and a delivered/picked-up order must not re-credit it.
      const neverShipped = (CUSTOMER_CANCELLABLE_STATES as readonly string[]).includes(order.status);
      if (neverShipped) {
        const items = await tx
          .select()
          .from(shopOrderItems)
          .where(eq(shopOrderItems.order_id, order_id));
        for (const item of items) {
          await tx
            .update(shopProducts)
            .set({ stock: sql`${shopProducts.stock} + ${item.quantity}` })
            .where(eq(shopProducts.id, item.product_id));
        }
      }

      // A cancelled/refunded order can never hold a live dispatch chain.
      await tx
        .update(deliveries)
        .set({ status: 'failed', updated_at: new Date() })
        .where(
          and(
            eq(deliveries.order_id, order_id),
            inArray(deliveries.status, ['created', 'offered', 'accepted']),
          ),
        );

      // Ledger reversal, append-only, only where money actually moved.
      const { reversed_bdt } = await reverseShopOrder(
        tx,
        { id: order.id, shop_id: order.shop_id },
        { reason: `force_cancel:${reason_code}` },
      );
      reversedBdt = reversed_bdt;
    });

    if (guard) return guard;

    // §7 A3: the decision lands in audit_logs with actor + old/new.
    await writeAudit({
      adminUserId: dbUser.id,
      action: 'marketplace_order_force_cancelled',
      entityType: 'shop_order',
      entityId: order_id,
      oldValue: { status: prevStatus },
      newValue: {
        status: newStatus,
        reason_code,
        reason_text: reason_text ?? null,
        internal_note: internal_note ?? null,
        reversed_bdt: reversedBdt,
      },
      ip,
      userAgent,
    });

    // The reason surfaces to the affected user in-app (A3) — notify first so a
    // ws hiccup cannot swallow it.
    await notifyCustomerForceCancel(
      order_id,
      customerId,
      reason_text ? `${reason_code} — ${reason_text}` : reason_code,
    );

    try {
      const [orderRow] = await db
        .select({ shop_id: shopOrders.shop_id })
        .from(shopOrders)
        .where(eq(shopOrders.id, order_id))
        .limit(1);
      notifyWs([
        {
          event: 'shop:order_status',
          to: [
            { kind: 'user' as const, user_id: customerId },
            ...(orderRow?.shop_id ? [{ kind: 'shop_staff' as const, shop_id: orderRow.shop_id }] : []),
          ],
          payload: { order_id, status: newStatus },
        },
      ]);
    } catch (e: unknown) {
      logger.warn('[admin/marketplace/orders] ws notify failed', {
        orderId: order_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    logger.info('[admin/marketplace/orders] force-cancelled', {
      orderId: order_id,
      status: newStatus,
      reasonCode: reason_code,
      reversedBdt,
      adminId: dbUser.id,
    });

    return Response.json({
      order_id,
      status: newStatus,
      reason_code,
      // Where money moved, this is the amount the shop's balance was unwound by.
      reversed_bdt: reversedBdt,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Admin access required' }, { status: 403 });
    logger.error('[admin/marketplace/orders] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
