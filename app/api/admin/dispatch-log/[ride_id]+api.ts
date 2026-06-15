// GET /api/admin/dispatch-log/[ride_id]
// F15-API-04. Full dispatch offer log for a single ride.
import { db } from "@/src/db";
import { dispatchOffers, drivers, users, callLedger } from "@/src/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const rideIdSchema = z.string().uuid();

export async function GET(request: Request, { ride_id }: { ride_id: string }) {
  try {
    await requireRole("admin")(request);

    const parsedId = rideIdSchema.safeParse(ride_id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "ride_id must be a valid UUID" },
        { status: 400 },
      );
    }

    const offers = await db
      .select({
        id: dispatchOffers.id,
        driver_id: dispatchOffers.driver_id,
        driver_name: users.name,
        batch_index: dispatchOffers.batch_index,
        sent_at: dispatchOffers.sent_at,
        fetch_confirmed_at: dispatchOffers.fetch_confirmed_at,
        responded_at: dispatchOffers.responded_at,
        outcome: dispatchOffers.outcome,
        rejection_reason: dispatchOffers.rejection_reason,
        filtered_reason: dispatchOffers.filtered_reason,
      })
      .from(dispatchOffers)
      .innerJoin(drivers, eq(dispatchOffers.driver_id, drivers.id))
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(dispatchOffers.ride_id, parsedId.data))
      .orderBy(asc(dispatchOffers.batch_index), asc(dispatchOffers.sent_at));

    // Fetch matching call_ledger deduction rows
    const ledgerRows = await db
      .select({
        driver_id: callLedger.driver_id,
        event_type: callLedger.event_type,
        delta: callLedger.delta,
        balance_after: callLedger.balance_after,
        reason: callLedger.reason,
        created_at: callLedger.created_at,
      })
      .from(callLedger)
      .where(
        and(
          eq(callLedger.ride_id, parsedId.data),
          eq(callLedger.event_type, "deduction"),
        ),
      );

    const ledgerByDriver = new Map(ledgerRows.map((l) => [l.driver_id, l]));

    const acceptedOffer = offers.find((o) => o.outcome === "accepted");

    return Response.json({
      ride_id: parsedId.data,
      offers: offers.map((o) => ({
        ...o,
        call_ledger_event: ledgerByDriver.get(o.driver_id) ?? null,
      })),
      total_offers: offers.length,
      accepted_by: acceptedOffer?.driver_id ?? null,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/dispatch-log] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
