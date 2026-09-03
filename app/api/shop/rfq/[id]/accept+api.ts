/**
 * POST /api/shop/rfq/[id]/accept — customer accepts quote
 */
import { db } from "@/src/db";
import { shopRfqs } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
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

    // §B.0 atomic transition — conditional WHERE guards against racing decline/cancel
    const updated = await db
      .update(shopRfqs)
      .set({ status: "awarded", awarded_at: new Date(), updated_at: new Date() })
      .where(
        and(
          eq(shopRfqs.id, id),
          eq(shopRfqs.status, "quoted"),
        ),
      )
      .returning({ id: shopRfqs.id });

    if (updated.length === 0) {
      return Response.json(
        { error: "invalid_transition", message: "No quote to accept" },
        { status: 409 },
      );
    }

    return Response.json({ message: "RFQ awarded" });
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
    logger.error("[shop/rfq/[id]/accept POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
