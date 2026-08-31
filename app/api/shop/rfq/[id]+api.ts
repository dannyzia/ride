/**
 * RFQ management endpoints.
 *
 * PATCH  /api/shop/rfq/[id]/quote — shop staff quotes (sets price)
 * POST   /api/shop/rfq/[id]/decline — shop staff declines
 * POST   /api/shop/rfq/[id]/accept — customer accepts quote
 * POST   /api/shop/rfq/[id]/cancel — customer cancels RFQ
 *
 * State machine per §B.6:
 * open → quoted (quote) | declined (decline) | expired (job 50) | cancelled (cancel)
 * quoted → awarded (accept) | declined | expired | cancelled
 * awarded/declined/expired/cancelled → terminal
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

// GET /api/shop/rfq/[id] — public RFQ detail
export async function GET(request: Request, { id }: { id: string }) {
  try {
    const rows = await db
      .select()
      .from(shopRfqs)
      .where(eq(shopRfqs.id, id))
      .limit(1);

    const rfq = rows[0];
    if (!rfq) {
      return Response.json(
        { error: "not_found", message: "RFQ not found" },
        { status: 404 },
      );
    }

    return Response.json({ rfq });
  } catch (err: unknown) {
    logger.error("[shop/rfq GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

// PATCH /api/shop/rfq/[id]/quote — shop quotes
const quoteSchema = z.object({
  quoted_price_bdt: z.number().int().positive(),
  quoted_notes: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const rfqRows = await db
      .select()
      .from(shopRfqs)
      .where(eq(shopRfqs.id, id))
      .limit(1);

    const rfq = rfqRows[0];
    if (!rfq) {
      return Response.json(
        { error: "not_found", message: "RFQ not found" },
        { status: 404 },
      );
    }

    if (rfq.status !== "open") {
      return Response.json(
        { error: "invalid_transition", message: "RFQ is not open" },
        { status: 409 },
      );
    }

    await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER", "STAFF"])(
      request,
    );

    const result = await parseJsonBody(request, quoteSchema);
    if (!result.ok) return result.response;

    await db
      .update(shopRfqs)
      .set({
        status: "quoted",
        quoted_price_bdt: result.data.quoted_price_bdt,
        quoted_notes: result.data.quoted_notes,
        quoted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(shopRfqs.id, id));

    return Response.json({ message: "Quote submitted" });
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
    logger.error("[shop/rfq PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

// POST /api/shop/rfq/[id]/decline — shop declines
export async function POST(request: Request, { id }: { id: string }) {
  try {
    const rfqRows = await db
      .select()
      .from(shopRfqs)
      .where(eq(shopRfqs.id, id))
      .limit(1);

    const rfq = rfqRows[0];
    if (!rfq) {
      return Response.json(
        { error: "not_found", message: "RFQ not found" },
        { status: 404 },
      );
    }

    if (rfq.status !== "open" && rfq.status !== "quoted") {
      return Response.json(
        { error: "invalid_transition", message: "RFQ cannot be declined" },
        { status: 409 },
      );
    }

    // Shop staff declines
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop(); // quote, decline, accept, cancel

    if (action === "decline") {
      await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER", "STAFF"])(
        request,
      );
      await db
        .update(shopRfqs)
        .set({ status: "declined", updated_at: new Date() })
        .where(eq(shopRfqs.id, id));
      return Response.json({ message: "RFQ declined" });
    }

    if (action === "accept") {
      // Customer accepts quote
      if (rfq.status !== "quoted") {
        return Response.json(
          { error: "invalid_transition", message: "No quote to accept" },
          { status: 409 },
        );
      }
      const { dbUser } = await requireAnyRole(["rider", "driver"])(request);
      if (dbUser.id !== rfq.rider_user_id) {
        return Response.json(
          { error: "forbidden", message: "Only the RFQ creator can accept" },
          { status: 403 },
        );
      }
      await db
        .update(shopRfqs)
        .set({ status: "awarded", awarded_at: new Date(), updated_at: new Date() })
        .where(eq(shopRfqs.id, id));
      return Response.json({ message: "RFQ awarded" });
    }

    if (action === "cancel") {
      // Customer cancels RFQ
      if (rfq.status !== "open" && rfq.status !== "quoted") {
        return Response.json(
          { error: "invalid_transition", message: "RFQ cannot be cancelled" },
          { status: 409 },
        );
      }
      const { dbUser } = await requireAnyRole(["rider", "driver"])(request);
      if (dbUser.id !== rfq.rider_user_id) {
        return Response.json(
          { error: "forbidden", message: "Only the RFQ creator can cancel" },
          { status: 403 },
        );
      }
      await db
        .update(shopRfqs)
        .set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
        .where(eq(shopRfqs.id, id));
      return Response.json({ message: "RFQ cancelled" });
    }

    return Response.json(
      { error: "invalid_action", message: "Unknown action" },
      { status: 400 },
    );
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
    logger.error("[shop/rfq POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
