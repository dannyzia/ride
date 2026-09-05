/**
 * PATCH /api/shop/rfq/[id]/quote
 * Shop staff quotes (or re-quotes) an RFQ: open/quoted → quoted.
 * Verb per the routing contract in app/api/shop/rfq/[id]+api.ts header (v1 §C.1).
 * Z1: persists state only — WS emissions land in Z2.
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";

const quoteSchema = z.object({
  quoted_price_bdt: z.number().int().positive(),
  quoted_notes: z.string().max(2000).optional(),
});

const QUOTABLE_STATES = ["open", "quoted"] as const;

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid RFQ id" }, { status: 400 });
    }

    if (!(await isVerticalEnabled("marketplace_shops_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Shops are not enabled" },
        { status: 403 },
      );
    }

    const result = await parseJsonBody(request, quoteSchema);
    if (!result.ok) return result.response;

    let guard: Response | null = null;
    let rfqOut: Record<string, unknown> | undefined;
    await db.transaction(async (tx) => {
      const rfqRows = await tx
        .select()
        .from(shopRfqs)
        .where(eq(shopRfqs.id, id))
        .limit(1)
        .for("update");

      const rfq = rfqRows[0];
      if (!rfq) {
        guard = Response.json({ error: "not_found", message: "RFQ not found" }, { status: 404 });
        return;
      }

      await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER"])(request);

      if (!(QUOTABLE_STATES as readonly string[]).includes(rfq.status)) {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot quote from ${rfq.status}` },
          { status: 409 },
        );
        return;
      }

      const updated = await tx
        .update(shopRfqs)
        .set({
          status: "quoted",
          quoted_price_bdt: result.data.quoted_price_bdt,
          quoted_notes: result.data.quoted_notes ?? null,
          quoted_at: new Date(),
          updated_at: new Date(),
        })
        .where(and(eq(shopRfqs.id, id), inArray(shopRfqs.status, [...QUOTABLE_STATES])))
        .returning();

      if (updated.length === 0) {
        guard = Response.json(
          { error: "invalid_transition", message: "RFQ state changed concurrently" },
          { status: 409 },
        );
        return;
      }
      rfqOut = updated[0];
    });

    if (guard) return guard;
    logger.info("[shop/rfq/quote] rfq quoted", { rfqId: id });
    return Response.json({ rfq: rfqOut });
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
    logger.error("[shop/rfq/quote] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
