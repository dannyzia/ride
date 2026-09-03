/**
 * POST /api/rental/requests/[id]/confirm
 * Customer confirms the booking after assignment is fulfilled.
 * Guards (A3 — §B.0, evaluated against the FOR UPDATE-locked row): owner,
 * status=awarded, live assignment fulfilled, deadline set+unelapsed,
 * tracking⇒fleet_ack_at set. Lock order matches demoteWinner (rentalRequests
 * first); no assignment-row lock is taken.
 */
import { db } from "@/src/db";
import { rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const { dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    let guard: Response | null = null;
    await db.transaction(async (tx) => {
      const reqRows = await tx
        .select()
        .from(rentalRequests)
        .where(eq(rentalRequests.id, id))
        .limit(1)
        .for("update");

      const req = reqRows[0];
      if (!req) {
        guard = Response.json(
          { error: "not_found", message: "Request not found" },
          { status: 404 },
        );
        return;
      }

      if (req.rider_user_id !== dbUser.id) {
        guard = Response.json(
          { error: "forbidden", message: "Only the request owner can confirm" },
          { status: 403 },
        );
        return;
      }

      if (req.status !== "awarded") {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot confirm from ${req.status}` },
          { status: 409 },
        );
        return;
      }

      // F16: assignment must be fulfilled — checked against the locked state
      // so a racing job-47 demotion (release) aborts the confirm instead of
      // yielding `confirmed` with a released assignment.
      const assignRows = await tx
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
        guard = Response.json(
          { error: "assignment_pending", message: "Fleet has not assigned a driver yet" },
          { status: 409 },
        );
        return;
      }

      // F4: deadline must be set and not elapsed
      if (!req.confirmation_deadline_at) {
        guard = Response.json(
          { error: "assignment_pending", message: "Confirmation window not yet open" },
          { status: 409 },
        );
        return;
      }
      if (new Date(req.confirmation_deadline_at) < new Date()) {
        guard = Response.json(
          { error: "confirm_window_elapsed", message: "Confirmation window has elapsed" },
          { status: 409 },
        );
        return;
      }

      // F45: tracking fork requires fleet_ack_at
      if (req.tracking_required && !req.fleet_ack_at) {
        guard = Response.json(
          { error: "fleet_ack_pending", message: "Fleet has not acknowledged yet" },
          { status: 409 },
        );
        return;
      }

      const updated = await tx
        .update(rentalRequests)
        .set({
          status: "confirmed",
          confirmed_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(rentalRequests.id, id),
            eq(rentalRequests.status, "awarded"),
          ),
        )
        .returning({ id: rentalRequests.id });

      if (updated.length === 0) {
        throw Object.assign(new Error("invalid_transition"), { status: 409 });
      }

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "customer_confirmed",
        created_by: dbUser.id,
      });
    });

    if (guard) return guard;
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
