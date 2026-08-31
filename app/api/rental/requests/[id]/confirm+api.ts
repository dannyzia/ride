/**
 * POST /api/rental/requests/[id]/confirm
 * Customer confirms the booking after assignment is fulfilled.
 * Guards: assignment fulfilled, deadline not elapsed, tracking: fleet_ack_at IS NOT NULL.
 */
import { db } from "@/src/db";
import { rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    const reqRows = await db
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.id, id))
      .limit(1);

    const req = reqRows[0];
    if (!req) {
      return Response.json(
        { error: "not_found", message: "Request not found" },
        { status: 404 },
      );
    }

    if (req.rider_user_id !== dbUser.id) {
      return Response.json(
        { error: "forbidden", message: "Only the request owner can confirm" },
        { status: 403 },
      );
    }

    if (req.status !== "awarded") {
      return Response.json(
        { error: "invalid_transition", message: `Cannot confirm from ${req.status}` },
        { status: 409 },
      );
    }

    // F16: assignment must be fulfilled
    const assignRows = await db
      .select()
      .from(awardedBidAssignments)
      .where(
        and(
          eq(awardedBidAssignments.request_id, id),
          isNull(awardedBidAssignments.released_at), // live assignment
        ),
      )
      .limit(1);

    const assignment = assignRows[0];
    if (!assignment?.assigned_driver_user_id) {
      return Response.json(
        { error: "assignment_pending", message: "Fleet has not assigned a driver yet" },
        { status: 409 },
      );
    }

    // F4: deadline must be set and not elapsed
    if (!req.confirmation_deadline_at) {
      return Response.json(
        { error: "assignment_pending", message: "Confirmation window not yet open" },
        { status: 409 },
      );
    }
    if (new Date(req.confirmation_deadline_at) < new Date()) {
      return Response.json(
        { error: "confirm_window_elapsed", message: "Confirmation window has elapsed" },
        { status: 409 },
      );
    }

    // F45: tracking fork requires fleet_ack_at
    if (req.tracking_required && !req.fleet_ack_at) {
      return Response.json(
        { error: "fleet_ack_pending", message: "Fleet has not acknowledged yet" },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(rentalRequests)
        .set({
          status: "confirmed",
          confirmed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(rentalRequests.id, id));

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "customer_confirmed",
        created_by: dbUser.id,
      });
    });

    return Response.json({ message: "Booking confirmed" });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: (err as Error).message ?? "Not authorized" },
        { status: 403 },
      );
    if (status === 409)
      return Response.json(
        { error: "invalid_transition", message: (err as Error).message },
        { status: 409 },
      );
    logger.error("[rental/confirm POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
