/**
 * GET /api/delivery/offers — the S6 dispatched-offers inbox (plan 27 §6.1;
 * the §6 passive feed is superseded). Delivery Men AND drivers with the
 * Deliveries toggle ON (requireDeliveryAgent — server-side gate).
 *
 * Returns: the ONE live offer (full details — shop, pickup, customer contact,
 * dropoff, order value, fee, parcel class), the active accepted delivery if
 * any (one active job at a time, both roles), the dispatch-hold flag (F-33),
 * and recent leg history.
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { courierDebtHoldsDispatch } from '@/lib/deliverySettlement';
import { db } from '@/src/db';
import { deliveries, shopOrders, shops, users } from '@/src/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

interface LegDetailRow {
  id: string;
  status: string;
  source_vertical: string;
  pickup_address: string | null;
  pickup_lat: string | null;
  pickup_lng: string | null;
  dropoff_address: string | null;
  dropoff_lat: string | null;
  dropoff_lng: string | null;
  delivery_fee_bdt: number | null;
  offer_expires_at: Date | null;
  accepted_at: Date | null;
  picked_up_at: Date | null;
  order_id: string | null;
  shop_name: string | null;
  order_total_bdt: number | null;
  order_subtotal_bdt: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  parcel_class: string | null;
}

/** Shape an offer/active leg with the full §6.1 dispatch details. */
async function legWithDetails(legId: string): Promise<LegDetailRow | null> {
  const rows = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      source_vertical: deliveries.source_vertical,
      pickup_address: deliveries.pickup_address,
      pickup_lat: deliveries.pickup_lat,
      pickup_lng: deliveries.pickup_lng,
      dropoff_address: deliveries.dropoff_address,
      dropoff_lat: deliveries.dropoff_lat,
      dropoff_lng: deliveries.dropoff_lng,
      delivery_fee_bdt: deliveries.delivery_fee_bdt,
      offer_expires_at: deliveries.offer_expires_at,
      accepted_at: deliveries.accepted_at,
      picked_up_at: deliveries.picked_up_at,
      order_id: deliveries.order_id,
      shop_name: shops.name,
      order_total_bdt: shopOrders.total_bdt,
      order_subtotal_bdt: shopOrders.subtotal_bdt,
      customer_name: users.name,
      customer_phone: users.phone,
      parcel_class: deliveries.source_vertical,
    })
    .from(deliveries)
    .leftJoin(shopOrders, eq(deliveries.order_id, shopOrders.id))
    .leftJoin(shops, eq(shopOrders.shop_id, shops.id))
    .leftJoin(users, eq(deliveries.dropoff_user_id, users.id))
    .where(eq(deliveries.id, legId))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireDeliveryAgent(request);

    const [liveOffer, activeLeg, dispatchHeld] = await Promise.all([
      db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.status, 'offered'),
            eq(deliveries.offered_to_user_id, auth.dbUser.id),
          ),
        )
        .limit(1),
      db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(
          and(
            inArray(deliveries.status, ['accepted', 'picked_up']),
            eq(deliveries.delivery_man_user_id, auth.dbUser.id),
          ),
        )
        .limit(1),
      courierDebtHoldsDispatch(auth.dbUser.id),
    ]);

    const offer = liveOffer[0] ? await legWithDetails(liveOffer[0].id) : null;
    const active = activeLeg[0] ? await legWithDetails(activeLeg[0].id) : null;

    const history = await db
      .select({
        id: deliveries.id,
        status: deliveries.status,
        source_vertical: deliveries.source_vertical,
        delivery_fee_bdt: deliveries.delivery_fee_bdt,
        delivered_at: deliveries.delivered_at,
        shop_name: shops.name,
      })
      .from(deliveries)
      .leftJoin(shopOrders, eq(deliveries.order_id, shopOrders.id))
      .leftJoin(shops, eq(shopOrders.shop_id, shops.id))
      .where(
        and(
          eq(deliveries.delivery_man_user_id, auth.dbUser.id),
          inArray(deliveries.status, ['delivered', 'failed']),
        ),
      )
      .orderBy(desc(sql`COALESCE(${deliveries.delivered_at}, ${deliveries.updated_at})`))
      .limit(20);

    return Response.json(
      {
        kind: auth.kind,
        dispatch_held: dispatchHeld,
        offer,
        active,
        history,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      return Response.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }
    if (status === 403) {
      return Response.json(
        { error: 'forbidden', message: 'Not an active delivery agent (courier or driver with Deliveries ON)' },
        { status: 403 },
      );
    }
    logger.error('[delivery/offers GET] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
