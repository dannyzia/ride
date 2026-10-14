/**
 * GET /api/shop/[id]/settlement — S3 §12 settlement view.
 *
 * OWNER/MANAGER only (STAFF is orders-only — the restriction is this route's
 * role array, not the UI). Returns the shop's shop_ledger entries (desc) and
 * the balance (sum of SIGNED amount_bdt paisa).
 */
import { db } from "@/src/db";
import { shopLedger } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, desc, sum } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const entries = await db
      .select()
      .from(shopLedger)
      .where(eq(shopLedger.shop_id, id))
      .orderBy(desc(shopLedger.created_at))
      .limit(200);

    const [balanceRow] = await db
      .select({ balance: sum(shopLedger.amount_bdt) })
      .from(shopLedger)
      .where(eq(shopLedger.shop_id, id));

    return Response.json({
      entries,
      balance_bdt: Number(balanceRow?.balance ?? 0),
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Only the owner or manager can view settlement" },
        { status: 403 },
      );
    logger.error("[shop/settlement GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
