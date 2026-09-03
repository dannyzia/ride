/**
 * GET /api/admin/marketplace/rental/requests/[id] — request detail + bids + events timeline
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import {
  rentalRequests,
  rentalBids,
  rentalRequestEvents,
} from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const [req] = await db
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.id, id))
      .limit(1);

    if (!req) {
      return Response.json({ error: "not_found", message: "Request not found" }, { status: 404 });
    }

    const bids = await db
      .select()
      .from(rentalBids)
      .where(eq(rentalBids.request_id, id))
      .orderBy(desc(rentalBids.quoted_price_bdt));

    const events = await db
      .select()
      .from(rentalRequestEvents)
      .where(eq(rentalRequestEvents.request_id, id))
      .orderBy(desc(rentalRequestEvents.created_at));

    return Response.json({ request: req, bids, events });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/rental/[id]] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
