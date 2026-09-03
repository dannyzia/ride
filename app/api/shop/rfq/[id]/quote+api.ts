/**
 * PATCH /api/shop/rfq/[id]/quote — shop staff quotes (sets price)
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq } from "drizzle-orm";
import { z } from "zod";

const quoteSchema = z.object({
  quoted_price_bdt: z.number().int().positive(),
  quoted_notes: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid RFQ id" }, { status: 400 });
    }

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

    await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER", "STAFF"])(request);

    const result = await parseJsonBody(request, quoteSchema);
    if (!result.ok) return result.response;

    // §B.0 atomic transition — conditional WHERE guards against racing decline/cancel
    const updated = await db
      .update(shopRfqs)
      .set({
        status: "quoted",
        quoted_price_bdt: result.data.quoted_price_bdt,
        quoted_notes: result.data.quoted_notes,
        quoted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(shopRfqs.id, id))
      .returning({ id: shopRfqs.id });

    if (updated.length === 0) {
      return Response.json(
        { error: "invalid_transition", message: "RFQ is not open" },
        { status: 409 },
      );
    }

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
    if (status === 409)
      return Response.json(
        { error: "invalid_transition", message: (err as Error).message },
        { status: 409 },
      );
    logger.error("[shop/rfq/[id]/quote PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
