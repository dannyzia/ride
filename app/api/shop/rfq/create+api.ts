/**
 * POST /api/shop/rfq/create
 * Create an RFQ (request for quote) on a shop's RFQ-flagged products.
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled, getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";

const rfqSchema = z.object({
  shop_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    if (!(await isVerticalEnabled("marketplace_shops_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Shops are not enabled" },
        { status: 403 },
      );
    }

    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    const result = await parseJsonBody(request, rfqSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const ttlHours = await getConfigInt("shop_rfq_default_ttl_hours", 48);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const [rfq] = await db
      .insert(shopRfqs)
      .values({
        shop_id: body.shop_id,
        rider_user_id: dbUser.id,
        title: body.title,
        description: body.description,
        expires_at: expiresAt,
      })
      .returning({ id: shopRfqs.id });

    return Response.json(
      { rfq_id: rfq.id, expires_at: expiresAt.toISOString(), message: "RFQ created" },
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
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/rfq/create] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
