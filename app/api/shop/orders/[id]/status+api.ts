/**
 * PATCH /api/shop/orders/[id]/status
 * Update order status. Shop staff / the ordering rider may update.
 * State machine per §B.3.
 */
import { db } from "@/src/db";
import { shopOrders } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum([
    "accepted",
    "preparing",
    "ready_for_pickup",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ]),
  cancel_reason: z.string().max(500).optional(),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered", "cancelled"],
};

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;

    const orderRows = await db
      .select()
      .from(shopOrders)
      .where(eq(shopOrders.id, id))
      .limit(1);

    const order = orderRows[0];
    if (!order) {
      return Response.json(
        { error: "not_found", message: "Order not found" },
        { status: 404 },
      );
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(result.data.status)) {
      return Response.json(
        {
          error: "invalid_transition",
          message: `Cannot transition from ${order.status} to ${result.data.status}`,
        },
        { status: 409 },
      );
    }

    // Auth: shop member (owner/manager/staff) or the ordering rider
    let authorized = false;
    try {
      await requireShopMember(order.shop_id, ["OWNER", "MANAGER", "STAFF"])(
        request,
      );
      authorized = true;
    } catch {
      // Not a shop member — check if the ordering rider
    }

    if (!authorized) {
      const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
        request,
      );
      if (dbUser.id !== order.rider_user_id) {
        return Response.json(
          { error: "forbidden", message: "Not authorized" },
          { status: 403 },
        );
      }
    }

    // Set timestamp fields
    const updates: Record<string, unknown> = {
      status: result.data.status,
      updated_at: new Date(),
    };

    if (result.data.status === "accepted") updates.accepted_at = new Date();
    if (result.data.status === "preparing") updates.prepared_at = new Date();
    if (result.data.status === "ready_for_pickup") updates.ready_at = new Date();
    if (result.data.status === "out_for_delivery") updates.picked_up_at = new Date();
    if (result.data.status === "delivered") updates.delivered_at = new Date();
    if (result.data.status === "cancelled") {
      updates.cancelled_at = new Date();
      updates.cancel_reason = result.data.cancel_reason ?? null;
    }

    await db.update(shopOrders).set(updates).where(eq(shopOrders.id, id));

    return Response.json({ message: "Order updated", status: result.data.status });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/orders/status PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
