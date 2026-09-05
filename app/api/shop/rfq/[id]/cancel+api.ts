/**
 * POST /api/shop/rfq/[id]/cancel
 * RFQ owner (rider) or shop staff cancels: open/quoted → cancelled.
 * Z1: persists state only — WS emissions land in Z2.
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";

const cancelSchema = z.object({
  cancel_reason: z.string().max(500).optional(),
});

const CANCELLABLE_STATES = ["open", "quoted"] as const;

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

    // N17: bodyless cancel is legitimate — an absent body proceeds as {}
    const rawText = await request.text();
    let body: { cancel_reason?: string } = {};
    if (rawText.trim().length > 0) {
      const result = await parseJsonBody(
        new Request(request.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: rawText,
        }),
        cancelSchema,
      );
      if (!result.ok) return result.response;
      body = result.data;
    }

    const { dbUser } = await requireAnyRole(["rider", "driver"])(request);

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

      // Owner OR shop staff
      let authorized = rfq.rider_user_id === dbUser.id;
      if (!authorized) {
        try {
          await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER", "STAFF"])(request);
          authorized = true;
        } catch {
          // fall through — not staff either
        }
      }
      if (!authorized) {
        guard = Response.json(
          { error: "forbidden", message: "Not authorized" },
          { status: 403 },
        );
        return;
      }

      if (!(CANCELLABLE_STATES as readonly string[]).includes(rfq.status)) {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot cancel from ${rfq.status}` },
          { status: 409 },
        );
        return;
      }

      const updated = await tx
        .update(shopRfqs)
        .set({
          status: "cancelled",
          cancelled_at: new Date(),
          cancel_reason: body.cancel_reason ?? null,
          updated_at: new Date(),
        })
        .where(and(eq(shopRfqs.id, id), inArray(shopRfqs.status, [...CANCELLABLE_STATES])))
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
    logger.info("[shop/rfq/cancel] rfq cancelled", { rfqId: id });
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
    logger.error("[shop/rfq/cancel] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
