/**
 * GET /api/shop/mine — S3 dashboard bootstrap.
 *
 * Resolves the caller's shop (creator-match first, then active membership)
 * and returns identity + mode for every member role. The MONEY dashboard
 * (orders-by-state counts, workshop SLA view, settlement balance) is
 * attached ONLY for OWNER/MANAGER — STAFF is orders-only (§3: the UI hiding
 * buttons is not security; these fields are simply never sent).
 */
import { db } from "@/src/db";
import {
  shops,
  shopMembers,
  shopOrders,
  workshopRequests,
  shopLedger,
  users,
} from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { WORKSHOP_CONFIRM_SLA_HOURS, applyWorkshopSla } from "@/lib/workshopSla";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull, asc, count, sql, sum } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);

    if (!dbUser) {
      return Response.json(
        { error: "user_not_found", message: "No user record for this account" },
        { status: 404 },
      );
    }

    // Owner match first (§3: the owner surface is built around shops.owner_user_id).
    let shopRows = await db
      .select()
      .from(shops)
      .where(and(eq(shops.owner_user_id, dbUser.id), isNull(shops.deleted_at)))
      .orderBy(asc(shops.created_at))
      .limit(1);

    let role = "OWNER";
    if (!shopRows[0]) {
      // Non-owner member (MANAGER/STAFF — invited, never through the wizard).
      const memberRows = await db
        .select({ role: shopMembers.role, shop: shops })
        .from(shopMembers)
        .innerJoin(shops, eq(shopMembers.shop_id, shops.id))
        .where(
          and(
            eq(shopMembers.user_id, dbUser.id),
            isNull(shopMembers.removed_at),
            isNull(shops.deleted_at),
          ),
        )
        .orderBy(asc(shopMembers.joined_at))
        .limit(1);
      if (!memberRows[0]) {
        return Response.json(
          { error: "no_shop", message: "No shop is associated with this account" },
          { status: 404 },
        );
      }
      role = memberRows[0].role;
      shopRows = [memberRows[0].shop];
    }

    const shop = shopRows[0];
    const base = {
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        status: shop.status,
        is_verified: shop.is_verified,
        is_open: shop.is_open,
        busy: shop.busy,
        shop_type_id: shop.shop_type_id,
        logo_url: shop.logo_url,
      },
      role,
    };

    if (role !== "OWNER" && role !== "MANAGER") {
      return Response.json(base);
    }

    // S4/F-13: enforce the 2h SLA before counting — expired rows are already
    // `declined`, so `pending` is truthful and `overdue` never lingers.
    await applyWorkshopSla({ shopId: shop.id });

    const [orderCounts, workshopCounts, balanceRows] = await Promise.all([
      db
        .select({ status: shopOrders.status, n: count() })
        .from(shopOrders)
        .where(eq(shopOrders.shop_id, shop.id))
        .groupBy(shopOrders.status),
      db
        .select({
          pending: count(),
          overdue: sql<number>`count(*) FILTER (WHERE created_at < now() - interval '${sql.raw(
            String(WORKSHOP_CONFIRM_SLA_HOURS),
          )} hours')`,
        })
        .from(workshopRequests)
        .where(
          and(
            eq(workshopRequests.shop_id, shop.id),
            eq(workshopRequests.status, "requested"),
          ),
        ),
      db
        .select({ balance: sum(shopLedger.amount_bdt) })
        .from(shopLedger)
        .where(eq(shopLedger.shop_id, shop.id)),
    ]);

    const orders_by_status: Record<string, number> = {};
    for (const row of orderCounts) orders_by_status[row.status] = Number(row.n);

    return Response.json({
      ...base,
      dashboard: {
        orders_by_status,
        workshop: {
          pending: Number(workshopCounts[0]?.pending ?? 0),
          overdue: Number(workshopCounts[0]?.overdue ?? 0),
          confirm_sla_hours: WORKSHOP_CONFIRM_SLA_HOURS,
        },
        balance_bdt: Number(balanceRows[0]?.balance ?? 0),
      },
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    logger.error("[shop/mine GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
