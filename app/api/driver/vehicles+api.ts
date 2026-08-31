import { db } from '@/src/db';
import { vehicles, vehicleModels, drivers, users, vehicleTypeChanges } from '@/src/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  VEHICLE_TYPE_ZOD_ENUM,
  BODY_TYPE_ZOD_ENUM,
  checkDriverEligibility,
  type VehicleTypeEnum,
} from '@/lib/vehicleTypes';
import { resolveVehicleType, ManualReviewRequiredError, EligibilityError } from '@/lib/resolveVehicleType';
import { assignVehicleToDriver } from '@/lib/fleetAssignment';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, vehicle_id: drivers.vehicle_id, status: drivers.status })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const rows = await db.select({
      id: vehicles.id,
      vehicle_type: vehicles.vehicle_type,
      manufacturer: vehicles.manufacturer,
      model: vehicles.model,
      manufacturing_year: vehicles.manufacturing_year,
      registration_number: vehicles.registration_number,
      registration_date: vehicles.registration_date,
      has_ac: vehicles.has_ac,
      passenger_seats: vehicles.passenger_seats,
      fitness_expires_at: vehicles.fitness_expires_at,
      tax_token_expires_at: vehicles.tax_token_expires_at,
      engine_cc: vehicles.engine_cc,
      body_type: vehicles.body_type,
    })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id));

    // M3: Check if this driver has any admin_approval_adjustment type changes
    // (restrict "Adjusted" badge to this specific change_reason only)
    const [hasTypeChanges] = await db
      .select({ id: vehicleTypeChanges.id })
      .from(vehicleTypeChanges)
      .where(and(
        eq(vehicleTypeChanges.driver_id, driver.id),
        eq(vehicleTypeChanges.change_reason, 'admin_approval_adjustment'),
      ))
      .limit(1);

    const result = rows.map((v) => ({
      ...v,
      vehicle_model: `${v.manufacturer} ${v.model} ${v.manufacturing_year}`,
      registration_plate: v.registration_number,
      is_active: driver.vehicle_id != null && v.id === driver.vehicle_id,
      // §10.7: derived classification status — no new column
      driver_status: driver.status,
      has_type_changes: !!hasTypeChanges,
      // M4: classification_source — 'server' when vehicle has body_type OR engine_cc
      // (indicates new-client classification), 'legacy_client' otherwise
      classification_source: (v.body_type != null || v.engine_cc != null) ? 'server' : 'legacy_client',
    }));

    return Response.json({ vehicles: result }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/vehicles] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

// ── POST schema — backward-compatible ──────────────────────────────────────
// Legacy clients send { brand, model, registration_year, vehicle_type, registration_plate }.
// New clients may additionally send engine_cc, body_type, number_of_seats.
// When new fields are present AND vehicle_type is missing, the server
// classifies automatically. When vehicle_type IS present, it is used directly
// (legacy path) but the server may still enrich with classifier data.
const vehicleSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  registration_year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  // Legacy field — present in old clients, optional in new clients
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM.optional(),
  registration_plate: z.string().min(1).max(50),
  number_of_seats: z.number().int().min(1).max(20).optional(),
  // New classification fields — optional for backward compat
  engine_cc: z.number().int().min(0).max(20000).optional().nullable(),
  body_type: BODY_TYPE_ZOD_ENUM.optional().nullable(),
});

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);



export async function POST(request: Request) {
  // Hoist for catch block (§13.3 draft model insert)
  let dbUserId: string | undefined;
  let brandVal: string | undefined;
  let modelVal: string | undefined;
  let seatsVal: number | undefined;

  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    dbUserId = dbUser.id;

    const [driver] = await db.select({
      id: drivers.id,
      fleet_id: drivers.fleet_id,
      completed_rides_count: drivers.completed_rides_count,
      rating: drivers.rating,
    })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, vehicleSchema);
    if (!parsed.ok) return parsed.response;

    const { brand, model, registration_year, registration_plate, number_of_seats, engine_cc, body_type } = parsed.data;
    brandVal = brand;
    modelVal = model;
    seatsVal = number_of_seats ?? undefined;

    // Look up the vehicle model for metadata (typical_cc, body_type, seats, default type)
    const [existingModel] = await db.select({
      id: vehicleModels.id,
      default_vehicle_type: vehicleModels.default_vehicle_type,
      typical_cc_min: vehicleModels.typical_cc_min,
      typical_cc_max: vehicleModels.typical_cc_max,
      body_type: vehicleModels.body_type,
      passenger_seats: vehicleModels.passenger_seats,
    })
      .from(vehicleModels)
      .where(and(
        sql`lower(${vehicleModels.brand}) = lower(${brand})`,
        sql`lower(${vehicleModels.model}) = lower(${model})`,
        or(eq(vehicleModels.is_active, true), eq(vehicleModels.source, 'driver')),
      ))
      .limit(1);

    // Resolve vehicle type — server-authoritative
    const { vehicle_type, classification } = await resolveVehicleType(parsed.data, existingModel);

    const now = new Date();
    const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    // One transaction: eligibility gate + vehicle upsert + drivers.vehicle_type sync
    const { vehicle, model_created } = await db.transaction(async (tx) => {
      // Eligibility gate: only enforced when this is a type CHANGE
      const [existingVehicle] = await tx
        .select({ vehicle_type: vehicles.vehicle_type })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driver.id))
        .limit(1);

      if (existingVehicle && existingVehicle.vehicle_type !== vehicle_type) {
        const eligibility = checkDriverEligibility(vehicle_type, {
          completed_rides_count: driver.completed_rides_count,
          rating: Number(driver.rating),
        });
        if (!eligibility.eligible) {
          throw new EligibilityError(eligibility.reason ?? 'Eligibility requirements not met');
        }
      }

      // Upsert vehicle_models if new brand/model
      let modelCreated = false;
      if (!existingModel) {
        const inserted = await tx.insert(vehicleModels).values({
          brand,
          model,
          source: 'driver',
          created_by: dbUser.id,
          is_active: false,
          default_vehicle_type: vehicle_type as never,
          passenger_seats: number_of_seats ?? 4,
        }).onConflictDoNothing().returning({ id: vehicleModels.id });
        modelCreated = inserted.length > 0;
      }

      // Fleet model: the driver's owning fleet is guaranteed by the universal
      // backfill / registration (drivers.fleet_id NOT NULL).
      if (!driver.fleet_id) {
        throw new EligibilityError('Driver has no fleet — run scripts/fleet-backfill.ts');
      }
      const driverFleetId = driver.fleet_id;

      const [vehicleRow] = await tx.insert(vehicles).values({
        driver_id: driver.id,
        fleet_id: driverFleetId,
        vehicle_type: vehicle_type as never,
        manufacturer: brand,
        model,
        manufacturing_year: registration_year,
        engine_cc: engine_cc ?? existingModel?.typical_cc_min ?? null,
        body_type: (body_type ?? existingModel?.body_type ?? null) as never,
        has_ac: null,
        passenger_seats: number_of_seats ?? 4,
        registration_area: 'DHAKA_METRO' as never,
        vehicle_class_letter: 'KA' as never,
        registration_number: registration_plate.toUpperCase(),
        registration_date: `${registration_year}-01-01`,
        fitness_expires_at: toDateStr(oneYearAhead),
        tax_token_expires_at: toDateStr(oneYearAhead),
      }).returning();

      // Authoritative assignment row + active-pointer cache sync
      // (fleet_vehicle_assignments + vehicles.driver_id + drivers.vehicle_id/
      // vehicle_type) in the same transaction. Replaces the old upsert on the
      // dropped 1:1 unique index. This also closes any prior active
      // assignment for the driver (vehicle replacement).
      await assignVehicleToDriver(tx, {
        fleet_id: driverFleetId,
        vehicle_id: vehicleRow.id,
        driver_id: driver.id,
        reason: 'vehicle_registration',
      });

      return { vehicle: vehicleRow, model_created: modelCreated };
    });

    return Response.json({
      vehicle,
      model_created,
      // §12.3: additive classification field for new clients;
      // old clients ignore unknown fields.
      ...(classification ? { classification } : {}),
    }, { status: 201 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (err instanceof ManualReviewRequiredError) {
      // §13.3: Persist a draft model row for admin review. Uses provisional
      // default_vehicle_type='bike_basic' gated behind is_active=false so it
      // never appears in active queries. The vehicle row is NOT created (no-guess).
      if (dbUserId && brandVal && modelVal) {
        await db.insert(vehicleModels).values({
          brand: brandVal,
          model: modelVal,
          source: 'driver',
          created_by: dbUserId,
          is_active: false,
          default_vehicle_type: 'bike_basic' as never, // provisional; admin reclassifies
          passenger_seats: seatsVal ?? 4,
        }).onConflictDoNothing();
      }
      return Response.json({ error: 'manual_review_required', message: err.message }, { status: 422 });
    }
    if (err instanceof EligibilityError) {
      return Response.json({ error: 'eligibility_not_met', message: err.message }, { status: 422 });
    }
    logger.error('[driver/vehicles] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
