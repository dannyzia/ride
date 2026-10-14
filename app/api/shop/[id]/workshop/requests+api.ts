/**
 * Workshop requests inbox + transitions — S3 (§3, R4).
 *
 * OWNER/MANAGER only — workshop bookings are NOT orders; STAFF is orders-only
 * (§3 server-enforced role arrays, not UI hiding).
 *
 * GET: the inbox — requests joined with service + customer, with the 2h
 * confirm-SLA window computed per row (F-16/skepti audit: the SLA is
 * TRACKED here; a hard auto-expiry needs a scheduled reaper and is an
 * owner decision, QUESTION posted on the hub).
 * PATCH: transition requested→confirmed→in_progress→done via FOR UPDATE +
 * conditional write (the shop-order status pattern). When `done` and the
 * request carries an order, the shop settlement settles IN THE SAME TX
 * (F-13 same-settlement-as-F-11).
 */
import { db } from "@/src/db";
import {
  workshopRequests,
  workshopServices,
  shopOrders,
  users,
} from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { settleShopOrder } from "@/lib/shopLedger";
import { notifyWs } from "@/lib/wsNotify";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

export const WORKSHOP_CONFIRM_SLA_HOURS = 2;

type WorkshopStatus = "requested" | "confirmed" | "in_progress" | "done";

const VALID_TRANSITIONS: Record<string, string[] | undefined> = {
  requested: ["confirmed"],
  confirmed: ["in_progress"],
  in_progress: ["done"],
};

export async function GET(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    const base = db
      .select({
        id: workshopRequests.id,
        service_id: workshopRequests.service_id,
        service_name: workshopServices.name,
        service_price_bdt: workshopServices.price_bdt,
        service_duration_minutes: workshopServices.duration_minutes,
        customer_user_id: workshopRequests.customer_user_id,
        customer_name: users.name,
        customer_phone: users.phone,
        requested_date: workshopRequests.requested_date,
        window_start: workshopRequests.window_start,
        window_end: workshopRequests.window_end,
        note: workshopRequests.note,
        status: workshopRequests.status,
        order_id: workshopRequests.order_id,
        created_at: workshopRequests.created_at,
      })
      .from(workshopRequests)
      .innerJoin(workshopServices, eq(workshopRequests.service_id, workshopServices.id))
      .leftJoin(users, eq(workshopRequests.customer_user_id, users.id))
      .where(
        statusFilter
          ? and(
              eq(workshopRequests.shop_id, id),
              eq(workshopRequests.status, statusFilter as WorkshopStatus),
            )
          : eq(workshopRequests.shop_id, id),
      )
      .orderBy(desc(workshopRequests.created_at))
      .limit(100);

    const rows = await base;

    const now = Date.now();
    const slaMs = WORKSHOP_CONFIRM_SLA_HOURS * 3_600_000;
    const withSla = rows.map((r) => ({
      ...r,
      sla: {
        deadline: new Date(new Date(r.created_at).getTime() + slaMs).toISOString(),
        overdue:
          r.status === "requested" && new Date(r.created_at).getTime() + slaMs < now,
      },
    }));

    return Response.json({ requests: withSla });
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
    logger.error("[shop/workshop/requests GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const transitionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "in_progress", "done"]),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, transitionSchema);
    if (!result.ok) return result.response;

    let guard: Response | null = null;
    let newStatus: string | null = null;

    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(workshopRequests)
        .where(eq(workshopRequests.id, result.data.id))
        .limit(1)
        .for("update");

      const request0 = rows[0];
      if (!request0 || request0.shop_id !== id) {
        guard = Response.json(
          { error: "not_found", message: "Request not found" },
          { status: 404 },
        );
        return;
      }

      // Role gate AFTER the row lock, scoped to the row's shop.
      await requireShopMember(request0.shop_id, ["OWNER", "MANAGER"])(request);

      const allowed = VALID_TRANSITIONS[request0.status] as string[] | undefined;
      if (!allowed || !allowed.includes(result.data.status)) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: `Cannot transition from ${request0.status} to ${result.data.status}`,
          },
          { status: 409 },
        );
        return;
      }

      // F-13: a done service job settles its linked order in the SAME tx
      // (same settlement as F-11). The order row is read under this lock.
      if (result.data.status === "done" && request0.order_id) {
        const orderRows = await tx
          .select()
          .from(shopOrders)
          .where(eq(shopOrders.id, request0.order_id))
          .limit(1);

        const order = orderRows[0];
        if (order && order.status !== "delivered") {
          const settled = await tx
            .update(shopOrders)
            .set({
              status: "delivered",
              delivered_at: new Date(),
              updated_at: new Date(),
            })
            .where(and(eq(shopOrders.id, order.id), eq(shopOrders.status, order.status)))
            .returning({ id: shopOrders.id });

          if (settled.length > 0) {
            await settleShopOrder(tx, {
              id: order.id,
              shop_id: order.shop_id,
              subtotal_bdt: order.subtotal_bdt,
            });
          }
        } else if (order) {
          // Already delivered — make sure the ledger rows exist (defense
          // in depth for orders delivered before this wiring existed).
          await settleShopOrder(tx, {
            id: order.id,
            shop_id: order.shop_id,
            subtotal_bdt: order.subtotal_bdt,
          });
        }
      }

      const updated = await tx
        .update(workshopRequests)
        .set({ status: result.data.status, updated_at: new Date() })
        .where(
          and(eq(workshopRequests.id, result.data.id), eq(workshopRequests.status, request0.status)),
        )
        .returning({ id: workshopRequests.id });

      if (updated.length === 0) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: `Cannot transition from ${request0.status} to ${result.data.status}`,
          },
          { status: 409 },
        );
        return;
      }

      newStatus = result.data.status;
    });

    if (guard) return guard;

    notifyWs([
      {
        event: "shop:workshop_request_status",
        to: [{ kind: "shop_staff", shop_id: id }],
        payload: { shop_id: id, request_id: result.data.id, status: newStatus },
      },
    ]);

    return Response.json({ message: "Request updated", status: newStatus });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Only the owner or manager can manage workshop requests" },
        { status: 403 },
      );
    logger.error("[shop/workshop/requests PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
