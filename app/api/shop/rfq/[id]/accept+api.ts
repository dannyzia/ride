/**
 * POST /api/shop/rfq/[id]/accept
 * The requesting rider accepts the shop's quote: quoted → awarded.
 *
 * ⚠ DIVERGENCE RECORDED (execution order vs on-disk authority): the order's
 * transition table says `quoted → accepted`, but the shop_rfq_status enum in
 * src/db/schema.ts (and v1 spec §C.1) has `awarded` — no `accepted` value
 * exists, and this round forbids migrations. Implemented as `awarded` per the
 * on-disk authority; flagged to the orchestrator for ruling. If v2 truly
 * means `accepted`, that is a migration round.
 *
 * Z1: persists state only — WS emissions land in Z2.
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";

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

    const { dbUser } = await requireAnyRole(["rider"])(request);

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

      if (rfq.rider_user_id !== dbUser.id) {
        guard = Response.json(
          { error: "forbidden", message: "Only the RFQ owner can accept" },
          { status: 403 },
        );
        return;
      }

      if (rfq.status !== "quoted") {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot accept from ${rfq.status}` },
          { status: 409 },
        );
        return;
      }

      const updated = await tx
        .update(shopRfqs)
        .set({ status: "awarded", awarded_at: new Date(), updated_at: new Date() })
        .where(and(eq(shopRfqs.id, id), eq(shopRfqs.status, "quoted")))
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
    logger.info("[shop/rfq/accept] rfq awarded", { rfqId: id });
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
    logger.error("[shop/rfq/accept] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
