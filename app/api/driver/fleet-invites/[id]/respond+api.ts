/**
 * POST /api/driver/fleet-invites/[id]/respond — the INVITEE answers a fleet
 * driver invite (S5, plan 27 §4 F-17/R9 consent path).
 *
 * accept  → the §4.3 attach semantics run from the CONSENT side, with one
 *           hard difference from the direct attach: an existing driver in
 *           ANOTHER fleet is REJECTED (single_fleet_rule, F-17) — the consent
 *           path never silently transfers a driver away from another owner.
 *           Plan-limit check + per-fleet advisory lock + ACTIVE fleet gate
 *           all run inside the tx (same house order as POST /api/fleet/drivers).
 * decline → the invite is closed; nothing else changes.
 *
 * The caller must own the phone the invite was sent to.
 */
import { db } from "@/src/db";
import {
  drivers,
  fleetDriverInvites,
  fleetVehicleAssignments,
  fleets,
  users,
} from "@/src/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { verifySupabaseToken } from "@/lib/auth";
import { checkDriverLimit, takeFleetLimitLock } from "@/lib/fleetLimits";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const respondSchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid invite id" }, { status: 400 });
    }

    const supabaseUser = await verifySupabaseToken(request);
    const [dbUser] = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "No user record" }, { status: 403 });
    }

    const body = await parseJsonBody(request, respondSchema);
    if (!body.ok) return body.response;

    const [invite] = await db
      .select()
      .from(fleetDriverInvites)
      .where(eq(fleetDriverInvites.id, id))
      .limit(1);
    if (!invite) {
      return Response.json({ error: "not_found", message: "Invite not found" }, { status: 404 });
    }
    if (invite.phone !== dbUser.phone) {
      return Response.json({ error: "forbidden", message: "This invite belongs to another phone" }, { status: 403 });
    }
    if (invite.status !== "pending") {
      return Response.json({ error: "invite_not_pending", message: `Invite is ${invite.status}` }, { status: 409 });
    }
    if (new Date(invite.expires_at) <= new Date()) {
      await db
        .update(fleetDriverInvites)
        .set({ status: "expired", updated_at: new Date() })
        .where(eq(fleetDriverInvites.id, id));
      return Response.json({ error: "invite_expired", message: "Invite has expired" }, { status: 409 });
    }

    if (body.data.action === "decline") {
      await db
        .update(fleetDriverInvites)
        .set({ status: "declined", responded_at: new Date(), updated_at: new Date() })
        .where(and(eq(fleetDriverInvites.id, id), eq(fleetDriverInvites.status, "pending")));
      return Response.json({ status: "declined" }, { status: 200 });
    }

    // ── accept ────────────────────────────────────────────────────────────
    const result = await db.transaction(async (tx) => {
      // Claim the invite first — conditional UPDATE beats a row lock for the
      // one-shot barrier (concurrent accepts: exactly one wins).
      const claimed = await tx
        .update(fleetDriverInvites)
        .set({ status: "accepted", responded_at: new Date(), updated_at: new Date() })
        .where(and(eq(fleetDriverInvites.id, id), eq(fleetDriverInvites.status, "pending")))
        .returning({ id: fleetDriverInvites.id, fleet_id: fleetDriverInvites.fleet_id });
      if (claimed.length === 0) {
        throw Object.assign(new Error("Invite already answered"), {
          status: 409,
          errorCode: "invite_not_pending",
        });
      }
      const fleetId = claimed[0].fleet_id;

      // Fleet must still exist AND be ACTIVE (same D4 gate as attach).
      const [fleet] = await tx
        .select({ id: fleets.id, status: fleets.status })
        .from(fleets)
        .where(eq(fleets.id, fleetId))
        .limit(1);
      if (!fleet) {
        throw Object.assign(new Error("Fleet not found"), { status: 404, errorCode: "fleet_not_found" });
      }
      if (fleet.status !== "ACTIVE") {
        throw Object.assign(new Error("Fleet is not active"), { status: 403, errorCode: "fleet_not_active" });
      }

      // Serialize with the other add-flows; limit read shares the tx snapshot.
      await takeFleetLimitLock(tx, fleetId);
      const limit = await checkDriverLimit(fleetId, { tx });
      if (!limit.ok) {
        throw Object.assign(new Error(limit.message ?? "Plan limit exceeded"), {
          status: 403,
          errorCode: limit.error ?? "plan_limit_exceeded",
        });
      }

      const [existingDriver] = await tx
        .select({ id: drivers.id, fleet_id: drivers.fleet_id, status: drivers.status })
        .from(drivers)
        .where(eq(drivers.user_id, dbUser.id))
        .limit(1);

      if (!existingDriver) {
        // R9 upgrade path — the consented invite provisions the driver stub
        // (platform document verification still required before offers).
        const [driverRow] = await tx
          .insert(drivers)
          .values({ user_id: dbUser.id, fleet_id: fleetId, vehicle_type: "bike_basic", status: "pending" })
          .returning({ id: drivers.id });
        return { driver_id: driverRow.id, attached: "provisioned" as const };
      }

      if (existingDriver.fleet_id === fleetId) {
        throw Object.assign(new Error("You already belong to this fleet"), {
          status: 409,
          errorCode: "already_in_fleet",
        });
      }

      // F-17 single-fleet rule, reconciled with the universal fleet model:
      // drivers.fleet_id is NOT NULL — a solo driver sits in an implicit solo
      // NATIVE fleet. Leaving that FOR ONE'S OWN solo fleet is the normal
      // join-a-business-fleet path (same as the direct attach's B1 transfer);
      // leaving a REAL fleet (another owner's BUSINESS/EXTERNAL/HYBRID fleet)
      // is REJECTED — the consent path never silently moves a driver who
      // works for someone else.
      const [currentFleet] = await tx
        .select({ id: fleets.id, fleet_type: fleets.fleet_type, owner_user_id: fleets.owner_user_id })
        .from(fleets)
        .where(eq(fleets.id, existingDriver.fleet_id))
        .limit(1);
      if (currentFleet && currentFleet.fleet_type !== "NATIVE") {
        throw Object.assign(
          new Error("You already belong to another fleet — leave it before accepting"),
          { status: 409, errorCode: "single_fleet_rule" },
        );
      }

      // B2-style active-work guard (same physical constraint as the direct
      // attach): an active vehicle assignment or an online driver blocks the
      // move — a solo driver's own vehicle counts, so unassign first.
      const [assignmentRow] = await tx
        .select({ id: fleetVehicleAssignments.id })
        .from(fleetVehicleAssignments)
        .where(
          and(
            eq(fleetVehicleAssignments.driver_id, existingDriver.id),
            isNull(fleetVehicleAssignments.unassigned_at),
          ),
        )
        .limit(1);
      if (assignmentRow) {
        throw Object.assign(
          new Error("Unassign your current vehicle before joining a new fleet"),
          { status: 409, errorCode: "driver_transfer_blocked" },
        );
      }
      const [onlineRow] = await tx
        .select({ is_online: drivers.is_online })
        .from(drivers)
        .where(eq(drivers.id, existingDriver.id))
        .limit(1);
      if (onlineRow?.is_online) {
        throw Object.assign(new Error("Go offline before joining a new fleet"), {
          status: 409,
          errorCode: "driver_transfer_blocked",
        });
      }

      // Solo-NATIVE → business fleet transfer (single UPDATE; the implicit
      // solo fleet is untouched — Phase C defers its demotion ceremony).
      await tx
        .update(drivers)
        .set({ fleet_id: fleetId, updated_at: new Date() })
        .where(eq(drivers.id, existingDriver.id));

      return { driver_id: existingDriver.id, attached: "transferred" as const };
    });

    logger.info("[fleet-invite] accepted", { invite_id: id, driver_id: result.driver_id });
    return Response.json({ ...result, status: "accepted" }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    const code = (err as { errorCode?: string }).errorCode;
    if (status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (status && code) {
      return Response.json(
        { error: code, message: errors.getErrorMessage(err, "Could not accept invite") },
        { status },
      );
    }
    if (status === 403 || status === 404 || status === 409) {
      return Response.json(
        { error: "conflict", message: errors.getErrorMessage(err, "Could not accept invite") },
        { status },
      );
    }
    logger.error("[fleet-invite] respond error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
