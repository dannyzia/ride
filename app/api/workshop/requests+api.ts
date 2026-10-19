/**
 * GET /api/workshop/requests — the CALLER's own service requests (F-13).
 *
 * Auth: required (any customer-capable role). Optional `?shop_id=` filter
 * (the shop-detail lane shows this shop's requests for the caller).
 * S4: the 2h SLA is ENFORCED here too — expired `requested` rows are
 * declined before the read, so the customer always sees the true state.
 * Divergence recorded: the OWNER/MANAGER inbox lives at
 * /api/shop/[id]/workshop/requests (members see every row of their shop).
 */
import { db } from "@/src/db";
import { workshopRequests, workshopServices, shops } from "@/src/db/schema";
import { requireMemberRoles } from "@/lib/auth";
import { applyWorkshopSla } from "@/lib/workshopSla";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);

    // Enforce the SLA for this customer's rows before reading.
    await applyWorkshopSla({ customerId: dbUser.id });

    const url = new URL(request.url);
    const shopId = url.searchParams.get("shop_id");
    if (shopId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: workshopRequests.id,
        shop_id: workshopRequests.shop_id,
        shop_name: shops.name,
        service_id: workshopRequests.service_id,
        service_name: workshopServices.name,
        service_price_bdt: workshopServices.price_bdt,
        requested_date: workshopRequests.requested_date,
        window_start: workshopRequests.window_start,
        window_end: workshopRequests.window_end,
        vehicle_details: workshopRequests.vehicle_details,
        note: workshopRequests.note,
        status: workshopRequests.status,
        order_id: workshopRequests.order_id,
        created_at: workshopRequests.created_at,
      })
      .from(workshopRequests)
      .innerJoin(workshopServices, eq(workshopRequests.service_id, workshopServices.id))
      .innerJoin(shops, eq(workshopRequests.shop_id, shops.id))
      .where(
        shopId
          ? and(
              eq(workshopRequests.customer_user_id, dbUser.id),
              eq(workshopRequests.shop_id, shopId),
            )
          : eq(workshopRequests.customer_user_id, dbUser.id),
      )
      .orderBy(desc(workshopRequests.created_at))
      .limit(50);

    return Response.json({ requests: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    logger.error("[workshop/requests GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
