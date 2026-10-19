/**
 * Workshop requests inbox + transitions — S3 (§3, R4) + S4 (F-13).
 *
 * GET (OWNER/MANAGER): the inbox — requests joined with service + customer,
 * with the 2h confirm-SLA window computed per row. S4: the SLA is now
 * ENFORCED — applyWorkshopSla flips expired `requested` rows to `declined`
 * (persisted) before every read/transition, so the inbox shows the outcome
 * instead of a stale overdue marker.
 * POST (customer): create a service request — service + vehicle details +
 * requested window (F-13 split lanes).
 * PATCH (OWNER/MANAGER): transition requested→confirmed→in_progress→done
 * via FOR UPDATE + conditional write; expired requests decline first and
 * any confirm lands as 409. When `done` and the request carries an order,
 * the shop settlement settles IN THE SAME TX (F-13 same-settlement).
 */
import { db } from "@/src/db";
import {
  workshopRequests,
  workshopServices,
  shopOrders,
  shops,
  users,
} from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { requireMemberRoles } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { settleShopOrder } from "@/lib/shopLedger";
import { applyWorkshopSla, WORKSHOP_CONFIRM_SLA_HOURS } from "@/lib/workshopSla";
import { notifyWs } from "@/lib/wsNotify";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, desc, isNull } from "drizzle-orm";
import { z } from "zod";

export { WORKSHOP_CONFIRM_SLA_HOURS };

type WorkshopStatus = "requested" | "confirmed" | "in_progress" | "done" | "declined";

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

    // S4/F-13: enforce the 2h SLA before reading — expired rows are already
    // `declined` by the time the inbox renders.
    await applyWorkshopSla({ shopId: id });

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

const createSchema = z
  .object({
    service_id: z.string().uuid(),
    requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    window_start: z.string().regex(/^\d{2}:\d{2}$/),
    window_end: z.string().regex(/^\d{2}:\d{2}$/),
    vehicle_details: z.string().min(1).max(300),
    note: z.string().max(500).optional(),
  })
  .refine((d) => d.window_end > d.window_start, {
    message: "window_end must be after window_start",
  });

/**
 * POST — customer creates a service request (F-13: service + vehicle
 * details + requested window). The 2h confirm SLA starts at created_at;
 * an expired request never survives a reader (applyWorkshopSla).
 */
export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);

    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // Not-before: a past date can never be confirmed.
    const today = new Date().toISOString().slice(0, 10);
    if (body.requested_date < today) {
      return Response.json(
        { error: "invalid_date", message: "Requested date cannot be in the past" },
        { status: 400 },
      );
    }

    const [shopRow] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.id, id), isNull(shops.deleted_at)))
      .limit(1);
    if (!shopRow) {
      return Response.json({ error: "shop_not_found", message: "Shop not found" }, { status: 404 });
    }

    const [serviceRow] = await db
      .select({ id: workshopServices.id })
      .from(workshopServices)
      .where(
        and(
          eq(workshopServices.id, body.service_id),
          eq(workshopServices.shop_id, id),
          isNull(workshopServices.deleted_at),
        ),
      )
      .limit(1);
    if (!serviceRow) {
      return Response.json(
        { error: "service_not_found", message: "Service not found" },
        { status: 404 },
      );
    }

    const [created] = await db
      .insert(workshopRequests)
      .values({
        shop_id: id,
        service_id: body.service_id,
        customer_user_id: dbUser.id,
        requested_date: body.requested_date,
        window_start: body.window_start,
        window_end: body.window_end,
        vehicle_details: body.vehicle_details,
        note: body.note ?? null,
      })
      .returning({ id: workshopRequests.id });

    // Shop inbox live-update (same event the transition PATCH emits — the
    // S3 inbox already refreshes on it).
    notifyWs([
      {
        event: "shop:workshop_request_status",
        to: [{ kind: "shop_staff", shop_id: id }],
        payload: { shop_id: id, request_id: created.id, status: "requested" },
      },
    ]);

    return Response.json(
      { request_id: created.id, message: "Request sent — the shop has 2h to confirm" },
      { status: 201 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    if (status === 400)
      return Response.json(
        { error: "invalid_request", message: (err as Error).message },
        { status: 400 },
      );
    logger.error("[shop/workshop/requests POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

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
      // S4/F-13: decline expired rows FIRST (same tx), so a confirm racing
      // the deadline reads `declined` below and lands as 409.
      await applyWorkshopSla({ shopId: id }, tx);

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
