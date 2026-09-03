/**
 * PATCH /api/shop/orders/[id]/status
 * Update order status. Shop staff / the ordering rider may update.
 * State machine per §B.3.
 * B2 (audit #10): the row is read under FOR UPDATE, the transition is
 * re-verified against the locked state, and the UPDATE is conditional on the
 * locked status (0 rows ⇒ 409) — no more unlocked read-check-write window.
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
    const targetStatus = result.data.status;

    let guard: Response | null = null;
    let newStatus: string | undefined;

    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, id))
        .limit(1)
        .for("update");

      const order = orderRows[0];
      if (!order) {
        guard = Response.json(
          { error: "not_found", message: "Order not found" },
          { status: 404 },
        );
        return;
      }

      // Validate transition against the LOCKED row
      const allowed = VALID_TRANSITIONS[order.status];
      if (!allowed || !allowed.includes(targetStatus)) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: `Cannot transition from ${order.status} to ${targetStatus}`,
          },
          { status: 409 },
        );
        return;
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
        const { dbUser } = await requireAnyRole(["rider", "driver"])(request);
        if (dbUser.id !== order.rider_user_id) {
          guard = Response.json(
            { error: "forbidden", message: "Not authorized" },
            { status: 403 },
          );
          return;
        }
      }

      // Set timestamp fields
      const updates: Record<string, unknown> = {
        status: targetStatus,
        updated_at: new Date(),
      };

      if (targetStatus === "accepted") updates.accepted_at = new Date();
      if (targetStatus === "preparing") updates.prepared_at = new Date();
      if (targetStatus === "ready_for_pickup") updates.ready_at = new Date();
      if (targetStatus === "out_for_delivery") updates.picked_up_at = new Date();
      if (targetStatus === "delivered") updates.delivered_at = new Date();
      if (targetStatus === "cancelled") {
        updates.cancelled_at = new Date();
        updates.cancel_reason = result.data.cancel_reason ?? null;
      }

      // Conditional write: 0 rows means a racing transition won the row
      const updated = await tx
        .update(shopOrders)
        .set(updates)
        .where(and(eq(shopOrders.id, id), eq(shopOrders.status, order.status)))
        .returning({ id: shopOrders.id });

      if (updated.length === 0) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: `Cannot transition from ${order.status} to ${targetStatus}`,
          },
          { status: 409 },
        );
        return;
      }

      newStatus = targetStatus;
    });

    if (guard) return guard;
    return Response.json({ message: "Order updated", status: newStatus });
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
