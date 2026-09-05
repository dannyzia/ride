/**
 * POST /api/shop/rfq/[id]/decline
 * Shop staff declines an RFQ: open/quoted → declined.
 * Z1: persists state only — WS emissions land in Z2.
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, inArray } from "drizzle-orm";

const DECLINABLE_STATES = ["open", "quoted"] as const;

export async function POST(request: Request, { id }: { id: string }) {
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

      await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER", "STAFF"])(request);

      if (!(DECLINABLE_STATES as readonly string[]).includes(rfq.status)) {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot decline from ${rfq.status}` },
          { status: 409 },
        );
        return;
      }

      const updated = await tx
        .update(shopRfqs)
        .set({ status: "declined", updated_at: new Date() })
        .where(and(eq(shopRfqs.id, id), inArray(shopRfqs.status, [...DECLINABLE_STATES])))
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
    logger.info("[shop/rfq/decline] rfq declined", { rfqId: id });
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
    logger.error("[shop/rfq/decline] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
