/**
 * GET /api/delivery/earnings — S6 delivery-man earnings screen (plan 27 §6 /
 * §12): fee × 100% at launch (delivery_commission_percent seed 0), COD
 * remittance dues list (F-33/F-38 evidence), and the courier's rating.
 *
 * Read-only: money rows are written solely by lib/deliverySettlement.ts.
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { courierDebtHoldsDispatch } from '@/lib/deliverySettlement';
import { db } from '@/src/db';
import { deliveryEarnings, courierRemittanceDues, shopOrders, shops, users } from '@/src/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const auth = await requireDeliveryAgent(request);

    const [earningRows, dueRows, ratingRow, dispatchHeld] = await Promise.all([
      db
        .select({
          id: deliveryEarnings.id,
          leg_id: deliveryEarnings.leg_id,
          fee_bdt: deliveryEarnings.fee_bdt,
          commission_bdt: deliveryEarnings.commission_bdt,
          net_bdt: deliveryEarnings.net_bdt,
          created_at: deliveryEarnings.created_at,
          shop_name: shops.name,
        })
        .from(deliveryEarnings)
        .leftJoin(shopOrders, eq(deliveryEarnings.order_id, shopOrders.id))
        .leftJoin(shops, eq(shopOrders.shop_id, shops.id))
        .where(eq(deliveryEarnings.delivery_man_user_id, auth.dbUser.id))
        .orderBy(desc(deliveryEarnings.created_at))
        .limit(50),
      db
        .select({
          id: courierRemittanceDues.id,
          leg_id: courierRemittanceDues.leg_id,
          amount_bdt: courierRemittanceDues.amount_bdt,
          status: courierRemittanceDues.status,
          remittance_note: courierRemittanceDues.remittance_note,
          created_at: courierRemittanceDues.created_at,
          remitted_at: courierRemittanceDues.remitted_at,
        })
        .from(courierRemittanceDues)
        .where(eq(courierRemittanceDues.delivery_man_user_id, auth.dbUser.id))
        .orderBy(desc(courierRemittanceDues.created_at))
        .limit(50),
      db
        .select({ rating: users.rating })
        .from(users)
        .where(eq(users.id, auth.dbUser.id))
        .limit(1),
      courierDebtHoldsDispatch(auth.dbUser.id),
    ]);

    const [earnedRow, pendingDueRow] = await Promise.all([
      db
        .select({ earned: sql<number>`COALESCE(SUM(${deliveryEarnings.net_bdt}), 0)::int` })
        .from(deliveryEarnings)
        .where(eq(deliveryEarnings.delivery_man_user_id, auth.dbUser.id)),
      db
        .select({ due: sql<number>`COALESCE(SUM(${courierRemittanceDues.amount_bdt}), 0)::int` })
        .from(courierRemittanceDues)
        .where(
          sql`${courierRemittanceDues.delivery_man_user_id} = ${auth.dbUser.id} AND ${courierRemittanceDues.status} = 'pending'`,
        ),
    ]);

    return Response.json(
      {
        kind: auth.kind,
        rating: ratingRow[0]?.rating ?? null,
        dispatch_held: dispatchHeld,
        totals: {
          earned_bdt: earnedRow[0]?.earned ?? 0,
          pending_dues_bdt: pendingDueRow[0]?.due ?? 0,
        },
        earnings: earningRows,
        dues: dueRows,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    if (status === 403) {
      return Response.json(
        { error: 'forbidden', message: 'Not an active delivery agent (courier or driver with Deliveries ON)' },
        { status: 403 },
      );
    }
    logger.error('[delivery/earnings GET] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
