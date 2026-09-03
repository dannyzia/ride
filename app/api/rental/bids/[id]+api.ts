/**
 * Rental bid actions — subpaths routed to dedicated files:
 * POST /api/rental/bids/[id]/withdraw → [id]/withdraw+api.ts
 * POST /api/rental/bids/[id]/complete → [id]/complete+api.ts
 *
 * This file handles GET /api/rental/bids/[id] (bid detail).
 * A1 (audit #1): sealed-bid privacy — only the submitter, an active staff
 * member of the bidding fleet (any role), or an admin may read a bid row.
 */
import { db } from "@/src/db";
import { rentalBids } from "@/src/db/schema";
import { requireAnyRole, requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid bid id" }, { status: 400 });
    }

    const { dbUser } = await requireAnyRole(["rider", "driver", "admin"])(request);

    const rows = await db
      .select()
      .from(rentalBids)
      .where(eq(rentalBids.id, id))
      .limit(1);

    const bid = rows[0];
    if (!bid) {
      return Response.json(
        { error: "not_found", message: "Bid not found" },
        { status: 404 },
      );
    }

    const isSubmitter = bid.submitted_by_user_id === dbUser.id;
    const isAdmin = dbUser.role === "admin";

    let isFleetStaff = false;
    if (!isSubmitter && !isAdmin && bid.fleet_id) {
      isFleetStaff = await (async () => {
        try {
          // Any staff role of the bidding fleet may view its own fleet's bid
          await requireFleetMember(
            bid.fleet_id,
            ["OWNER", "MANAGER", "DISPATCHER", "ACCOUNTANT", "VIEWER"],
          )(request);
          return true;
        } catch {
          return false;
        }
      })();
    }

    if (!isSubmitter && !isAdmin && !isFleetStaff) {
      return Response.json(
        { error: "forbidden", message: "Not authorized to view this bid" },
        { status: 403 },
      );
    }

    return Response.json({ bid });
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
    logger.error("[rental/bids/[id] GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
