/**
 * RFQ management endpoints — subpaths routed to dedicated files:
 * PATCH /api/shop/rfq/[id]/quote → [id]/quote+api.ts
 * POST /api/shop/rfq/[id]/decline → [id]/decline+api.ts
 * POST /api/shop/rfq/[id]/accept → [id]/accept+api.ts
 * POST /api/shop/rfq/[id]/cancel → [id]/cancel+api.ts
 *
 * This file handles GET /api/shop/rfq/[id] (RFQ detail).
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

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
