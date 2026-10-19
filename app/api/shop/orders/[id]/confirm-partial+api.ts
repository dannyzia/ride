/**
 * POST /api/shop/orders/[id]/confirm-partial — the customer accepts the
 * REDUCED order after a shop's out-of-stock partial accept (F-11).
 *
 * The shop's accept already recomputed subtotal/total from the remaining
 * items server-side; this stamp closes the loop (partial_confirmed_at). If
 * the customer never confirms, the free pre-pickup cancel path stays open.
 */
import { db } from "@/src/db";
import { shopOrders } from "@/src/db/schema";
import { requireMemberRoles } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid order id" }, { status: 400 });
    }

    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);

    let guard: Response | null = null;

    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, id))
        .limit(1)
        .for("update");

      const order = orderRows[0];
      if (!order) {
        guard = Response.json({ error: "not_found", message: "Order not found" }, { status: 404 });
        return;
      }
      if (order.rider_user_id !== dbUser.id) {
        guard = Response.json({ error: "forbidden", message: "Not your order" }, { status: 403 });
        return;
      }
      if (!order.unavailable_item_ids || order.unavailable_item_ids.length === 0) {
        guard = Response.json(
          { error: "not_partial", message: "This order has no missing items" },
          { status: 409 },
        );
        return;
      }
      if (order.partial_confirmed_at) {
        // Idempotent: a duplicate confirm is a no-op success.
        return;
      }

      await tx
        .update(shopOrders)
        .set({ partial_confirmed_at: new Date(), updated_at: new Date() })
        .where(eq(shopOrders.id, id));
    });

    if (guard) return guard;
    return Response.json({ message: "Partial order confirmed" });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    logger.error("[order/confirm-partial POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
