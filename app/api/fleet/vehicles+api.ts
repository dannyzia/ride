/**
 * GET  /api/fleet/vehicles?fleet_id=...  — List fleet vehicles (any ACTIVE member)
 * POST /api/fleet/vehicles?fleet_id=...  — Staff add-vehicle (OWNER/MANAGER)
 *
 * POST enforces plan limits server-side via checkVehicleLimit INSIDE the
 * mutation tx behind a per-fleet advisory xact lock (plan §4.1/§5/D3 — the
 * count read shares the tx snapshot with the insert). The GET endpoint's
 * at_limit flags are display-only (AC 3) and are never consulted here.
 *
 * Fleet add-flows epic (ISSUE-35) Phase A. Plan: .kilo/plans/2026-09-09-fleet-add-flows-epic-plan.md
 */
import { db } from "@/src/db";
import {
  drivers,
  fleets,
  registrationAreaEnum,
  users,
  vehicleClassLetterEnum,
  vehicles,
} from "@/src/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";
import {
  BODY_TYPE_ZOD_ENUM,
  VEHICLE_TYPE_ZOD_ENUM,
} from "@/lib/vehicleTypes";
import {
  checkVehicleLimit,
  takeFleetLimitLock,
} from "@/lib/fleetLimits";

const querySchema = z.object({ fleet_id: z.string().uuid() });

const addVehicleSchema = z.object({
  // House rule: import the Zod enum, never inline (R2: all 9 types accepted).
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  registration_plate: z.string().min(4).max(20),
  // Schema NOT NULL columns (plan §4.1 listed some as optional — the schema wins).
  manufacturer: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  manufacturing_year: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  passenger_seats: z.coerce.number().int().min(1).max(20),
  // Nullable schema columns.
  has_ac: z.boolean().nullable().optional(),
  engine_cc: z.coerce.number().int().min(30).max(20000).nullable().optional(),
  body_type: BODY_TYPE_ZOD_ENUM.nullable().optional(),
  // FOLLOWUP-A/B conventions (mirror driver self-add defaults).
  registration_area: z.enum(registrationAreaEnum.enumValues).default("DHAKA_METRO"),
  vehicle_class_letter: z.enum(vehicleClassLetterEnum.enumValues).default("KA"),
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
        id: vehicles.id,
        vehicle_type: vehicles.vehicle_type,
        manufacturer: vehicles.manufacturer,
        model: vehicles.model,
        manufacturing_year: vehicles.manufacturing_year,
        registration_number: vehicles.registration_number,
        passenger_seats: vehicles.passenger_seats,
        has_ac: vehicles.has_ac,
        created_at: vehicles.created_at,
        driver_id: vehicles.driver_id,
        driver_name: users.name,
        driver_phone: users.phone,
        is_online: drivers.is_online,
        driver_rating: drivers.rating,
      })
      .from(vehicles)
      .leftJoin(users, eq(vehicles.driver_id, users.id))
      .leftJoin(drivers, eq(vehicles.driver_id, drivers.id))
      .where(eq(vehicles.fleet_id, fleetId))
      .orderBy(asc(vehicles.created_at));

    return Response.json({ vehicles: rows }, { status: 200 });
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
    logger.error("[fleet/vehicles] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** POST — staff add-vehicle (OWNER/MANAGER) with in-tx plan-limit enforcement. */
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

    const body = await parseJsonBody(request, addVehicleSchema);
    if (!body.ok) return body.response;

    const registrationNumber = body.data.registration_plate.toUpperCase();

    const vehicle = await db.transaction(async (tx) => {
      // 1. Per-fleet advisory lock FIRST (plan §5) — serializes concurrent
      //    add-flows so the in-tx limit count cannot interleave with another
      //    flow's insert (TOCTOU family, Bug Survey theme 7).
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

      // 3. Plan-limit check on the tx handle — same snapshot as the insert.
      const limit = await checkVehicleLimit(fleetId, { tx });
      if (!limit.ok) {
        throw Object.assign(new Error(limit.message ?? "Plan limit exceeded"), {
          status: 403,
          errorCode: limit.error ?? "plan_limit_exceeded",
          limitCurrent: limit.current,
          limitMax: limit.limit,
        });
      }

      // 4. Duplicate registration guard (the DB unique index is global —
      //    schema reality; D5's per-fleet-only assumption corrected in plan).
      const [dup] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.registration_number, registrationNumber))
        .limit(1);
      if (dup) {
        throw Object.assign(new Error("Registration number already exists"), {
          status: 409,
          errorCode: "duplicate_registration",
        });
      }

      // 5. Insert (defaults mirror driver self-add conventions).
      const [vehicleRow] = await tx
        .insert(vehicles)
        .values({
          fleet_id: fleetId,
          driver_id: null, // unassigned pool vehicle — pointer cache written ONLY via fleetAssignment
          vehicle_type: body.data.vehicle_type as never,
          manufacturer: body.data.manufacturer,
          model: body.data.model,
          manufacturing_year: body.data.manufacturing_year,
          engine_cc: body.data.engine_cc ?? null,
          body_type: (body.data.body_type ?? null) as never,
          has_ac: body.data.has_ac ?? null,
          passenger_seats: body.data.passenger_seats,
          registration_area: body.data.registration_area as never,
          vehicle_class_letter: body.data.vehicle_class_letter as never,
          registration_number: registrationNumber,
          registration_date: `${body.data.manufacturing_year}-01-01`,
          fitness_expires_at: toDateStr(oneYearAhead()),
          tax_token_expires_at: toDateStr(oneYearAhead()),
        })
        .returning();
      return vehicleRow;
    });

    logger.info("[fleet/vehicles] vehicle added", {
      fleet_id: fleetId,
      vehicle_id: vehicle.id,
      actor_user_id: auth.dbUser.id,
    });

    return Response.json({ vehicle_id: vehicle.id, vehicle }, { status: 201 });
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
    // Defense-in-depth: the DB unique index is the final barrier anyway.
    if (errors.getErrorCode(err) === "23505") {
      return Response.json(
        { error: "duplicate_registration", message: "Registration number already exists" },
        { status: 409 },
      );
    }
    logger.error("[fleet/vehicles] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

function oneYearAhead(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
