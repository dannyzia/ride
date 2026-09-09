/**
 * GET  /api/fleet/drivers?fleet_id=...  — List fleet drivers (any ACTIVE member)
 * POST /api/fleet/drivers?fleet_id=...  — Staff attach-or-transfer driver (OWNER/MANAGER)
 *
 * POST implements plan §4.3 (fleet add-flows epic, ISSUE-35 Phase B; D1 option b
 * confirmed by ruling R1). Plan-limit enforcement is server-side:
 * checkDriverLimit INSIDE the mutation tx behind the per-fleet advisory xact
 * lock (plan §4.3/§5/D3 — the count read shares the tx snapshot with the write).
 *
 * Attach-or-transfer branches (plan §4.3):
 *   A1  target user has no drivers row            → provision (status pending) → 201 attached:'provisioned'
 *   A2  drivers row already in THIS fleet         → 409 already_in_fleet
 *   B1  drivers row in ANOTHER fleet, no active work → transfer (single fleet_id UPDATE) → 201 attached:'transferred'
 *   B2  active work (assignment) or online        → 409 driver_transfer_blocked
 *
 * Schema-reality deltas applied at implementation (Phase-A house pattern):
 *   - drivers.vehicle_type is NOT NULL with no default; provision supplies the
 *     register+api.ts precedent default "bike_basic" (§4.3's "vehicle fields
 *     NULL" holds for vehicle_id / min_per_km_bdt, which stay unset).
 *   - D1's "own no vehicles" transfer condition is subsumed by the active-
 *     assignment guard: unassigned vehicles have cleared driver pointers
 *     (lib/fleetAssignment invariant), so an active assignment is the only
 *     ownership surface that can strand a cross-fleet pointer.
 * Plan: .kilo/plans/2026-09-09-fleet-add-flows-epic-plan.md
 */
import { db } from "@/src/db";
import {
  drivers,
  fleets,
  fleetVehicleAssignments,
  users,
  vehicles,
} from "@/src/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";
import {
  checkDriverLimit,
  takeFleetLimitLock,
} from "@/lib/fleetLimits";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

const attachDriverSchema = z.object({
  user_id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsed.data.fleet_id;

    await requireFleetMember(fleetId)(request);

    const rows = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        vehicle_type: drivers.vehicle_type,
        vehicle_id: drivers.vehicle_id,
        status: drivers.status,
        rating: drivers.rating,
        completed_rides_count: drivers.completed_rides_count,
        is_online: drivers.is_online,
        created_at: drivers.created_at,
        name: users.name,
        phone: users.phone,
        vehicle_reg: vehicles.registration_number,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.vehicle_id, vehicles.id))
      .where(eq(drivers.fleet_id, fleetId))
      .orderBy(asc(drivers.created_at));

    return Response.json({ drivers: rows }, { status: 200 });
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
        { error: "forbidden", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }
    logger.error("[fleet/drivers] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** POST — staff attach-or-transfer (OWNER/MANAGER) with in-tx plan-limit enforcement. */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsed.data.fleet_id;

    const auth = await requireFleetMember(fleetId, ["OWNER", "MANAGER"])(request);

    const body = await parseJsonBody(request, attachDriverSchema);
    if (!body.ok) return body.response;
    const targetUserId = body.data.user_id;

    const result = await db.transaction(async (tx) => {
      // 1. Per-fleet advisory lock FIRST (plan §5) — serializes concurrent
      //    add-flows so the in-tx limit count cannot interleave with another
      //    flow's write (TOCTOU family, Bug Survey theme 7).
      await takeFleetLimitLock(tx, fleetId);

      // 2. Fleet status gate (D4): only ACTIVE fleets accept adds.
      const [fleet] = await tx
        .select({ id: fleets.id, status: fleets.status })
        .from(fleets)
        .where(eq(fleets.id, fleetId))
        .limit(1);
      if (!fleet) {
        throw Object.assign(new Error("Fleet not found"), {
          status: 404,
          errorCode: "fleet_not_found",
        });
      }
      if (fleet.status !== "ACTIVE") {
        throw Object.assign(new Error("Fleet is not active"), {
          status: 403,
          errorCode: "fleet_not_active",
        });
      }

      // 3. Plan-limit check on the tx handle — same snapshot as the write
      //    (plan §4.3 flow: check before branch dispatch).
      const limit = await checkDriverLimit(fleetId, { tx });
      if (!limit.ok) {
        throw Object.assign(new Error(limit.message ?? "Plan limit exceeded"), {
          status: 403,
          errorCode: limit.error ?? "plan_limit_exceeded",
          limitCurrent: limit.current,
          limitMax: limit.limit,
        });
      }

      // 4. Target must be a registered user (plan §4.3 body contract).
      const [targetUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetUser) {
        throw Object.assign(new Error("User not found"), {
          status: 404,
          errorCode: "user_not_found",
        });
      }

      // 5. Branch dispatch on the target's drivers row.
      const [existingDriver] = await tx
        .select({
          id: drivers.id,
          fleet_id: drivers.fleet_id,
          is_online: drivers.is_online,
        })
        .from(drivers)
        .where(eq(drivers.user_id, targetUserId))
        .limit(1);

      // A1 — no drivers row: provision (driver onboarding stub).
      if (!existingDriver) {
        const [driverRow] = await tx
          .insert(drivers)
          .values({
            user_id: targetUserId,
            fleet_id: fleetId,
            // Schema NOT NULL — register+api.ts precedent default (delta note).
            vehicle_type: "bike_basic",
            status: "pending",
          })
          .returning();
        return { driver_id: driverRow.id, attached: "provisioned" as const };
      }

      // A2 — already in THIS fleet.
      if (existingDriver.fleet_id === fleetId) {
        throw Object.assign(
          new Error("Driver already belongs to this fleet"),
          { status: 409, errorCode: "already_in_fleet" },
        );
      }

      // B2 guard — active work blocks transfer: an active vehicle assignment
      // (unassigned_at IS NULL — the partial unique index fva_driver_active_idx
      // guarantees at most one) or an online driver.
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
          new Error(
            "Driver transfer blocked: driver has an active vehicle assignment (unassign via fleet assignments first)",
          ),
          { status: 409, errorCode: "driver_transfer_blocked" },
        );
      }
      if (existingDriver.is_online) {
        throw Object.assign(
          new Error("Driver transfer blocked: driver is currently online"),
          { status: 409, errorCode: "driver_transfer_blocked" },
        );
      }

      // B1 — no active work: single-UPDATE transfer. Old fleet untouched
      // (Phase C defers the solo-fleet demotion ceremony).
      await tx
        .update(drivers)
        .set({ fleet_id: fleetId })
        .where(eq(drivers.id, existingDriver.id));
      return { driver_id: existingDriver.id, attached: "transferred" as const };
    });

    logger.info("[fleet/drivers] driver attached", {
      fleet_id: fleetId,
      driver_id: result.driver_id,
      attached: result.attached,
      actor_user_id: auth.dbUser.id,
    });

    return Response.json(result, { status: 201 });
  } catch (err: unknown) {
    // Auth errors arrive as bare { status: 401/403 } (no code) from lib/auth;
    // route errors carry errorCode. Map the default code by status.
    const status = errors.getErrorStatus(err);
    if (status !== undefined) {
      const routeCode = (err as { errorCode?: string }).errorCode;
      const code = routeCode ?? (status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error");
      const extra: Record<string, unknown> = {};
      const limitCurrent = (err as { limitCurrent?: number }).limitCurrent;
      const limitMax = (err as { limitMax?: number }).limitMax;
      if (limitCurrent !== undefined) extra.current = limitCurrent;
      if (limitMax !== undefined) extra.limit = limitMax;
      return Response.json(
        { error: code, message: errors.getErrorMessage(err), ...extra },
        { status },
      );
    }
    logger.error("[fleet/drivers] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
