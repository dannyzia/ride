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
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq } from "drizzle-orm";
import { z } from "zod";

// GET /api/shop/rfq/[id] — private RFQ detail.
// The quote is bidirectional private data: only the requesting rider or an
// active member of the quoted shop may read it. Shop/[id] remains public
// because the storefront catalog is public by design.
export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) {
      return Response.json({ error: "invalid_uuid", message: "Invalid RFQ id" }, { status: 400 });
    }

    const supabaseUser = await verifySupabaseToken(request);

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

    const { data: dbUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();
    if (userError || !dbUser) {
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    }

    if (rfq.rider_user_id !== dbUser.id) {
      try {
        await requireShopMember(rfq.shop_id, ["OWNER", "MANAGER", "STAFF"])(request);
      } catch {
        return Response.json(
          { error: "forbidden", message: "Not authorized" },
          { status: 403 },
        );
      }
    }

    return Response.json({ rfq });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    if (status === 403) {
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    }
    logger.error("[shop/rfq GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
