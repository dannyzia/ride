import { db } from '@/src/db';
import { vehicles, vehicleModels, drivers, users } from '@/src/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { VEHICLE_TYPE_ZOD_ENUM, checkDriverEligibility } from '@/lib/vehicleTypes';
import * as errors from '@/lib/errors';

class EligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EligibilityError';
  }
}

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, vehicle_id: drivers.vehicle_id })
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
    })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id));

    const result = rows.map((v) => ({
      ...v,
      vehicle_model: `${v.manufacturer} ${v.model} ${v.manufacturing_year}`,
      registration_plate: v.registration_number,
      // P0-A FIX: derive is_active from the driver's vehicle_id reference
      // instead of fabricating `true` for every vehicle.
      is_active: driver.vehicle_id != null && v.id === driver.vehicle_id,
    }));

    return Response.json({ vehicles: result }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/vehicles] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

const vehicleSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  registration_year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  registration_plate: z.string().min(1).max(50),
  number_of_seats: z.number().int().positive().optional(),
});

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({
      id: drivers.id,
      completed_rides_count: drivers.completed_rides_count,
      rating: drivers.rating,
    })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, vehicleSchema);
    if (!parsed.ok) return parsed.response;

    const { brand, model, registration_year, vehicle_type, registration_plate, number_of_seats } = parsed.data;

    // "Others" path: case-insensitive (brand, model) lookup among rows that are
    // either admin-activated or driver-submitted. If absent, insert a new
    // vehicle_models row as source='driver' + is_active=false (invisible to
    // other drivers' dropdowns until an admin activates it).
    const [existingModel] = await db.select({ id: vehicleModels.id })
      .from(vehicleModels)
      .where(and(
        sql`lower(${vehicleModels.brand}) = lower(${brand})`,
        sql`lower(${vehicleModels.model}) = lower(${model})`,
        or(eq(vehicleModels.is_active, true), eq(vehicleModels.source, 'driver')),
      ))
      .limit(1);

    const now = new Date();
    const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    // One transaction: eligibility gate + vehicle upsert + drivers.vehicle_type
    // sync. Dispatch reads drivers.vehicle_type for candidate filtering, so
    // B-2 must keep the two tables reconciled or the onboarding vehicle type
    // never reaches the dispatch pool.
    const { vehicle, model_created } = await db.transaction(async (tx) => {
      // Eligibility gate: only enforced when this is a type CHANGE (the driver
      // already has a vehicle of a different type). First-time registration is
      // the initial setup — new drivers have no history to gate on, and admin
      // adjusts the type at activation (admin/driver/approve
      // vehicle_type_adjusted). Mid-career changes go through the same gate as
      // vehicle-type-change+api.ts.
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

      // Model insert guarded by returning(): onConflictDoNothing() may no-op on
      // a concurrent insert — only report model_created when a row really landed.
      let modelCreated = false;
      if (!existingModel) {
        const inserted = await tx.insert(vehicleModels).values({
          brand,
          model,
          source: 'driver',
          created_by: dbUser.id,
          is_active: false,
          default_vehicle_type: vehicle_type as any,
          passenger_seats: number_of_seats ?? 4,
        }).onConflictDoNothing().returning({ id: vehicleModels.id });
        modelCreated = inserted.length > 0;
      }

      const [vehicleRow] = await tx.insert(vehicles).values({
        driver_id: driver.id,
        vehicle_type: vehicle_type as any,
        manufacturer: brand,
        model,
        manufacturing_year: registration_year,
        has_ac: null,
        passenger_seats: number_of_seats ?? 4,
        registration_area: 'DHAKA_METRO' as any,
        vehicle_class_letter: 'KA' as any,
        registration_number: registration_plate.toUpperCase(),
        registration_date: `${registration_year}-01-01`,
        fitness_expires_at: toDateStr(oneYearAhead),
        tax_token_expires_at: toDateStr(oneYearAhead),
      }).onConflictDoUpdate({
        target: vehicles.driver_id,
        set: {
          vehicle_type: vehicle_type as any,
          manufacturer: brand,
          model,
          manufacturing_year: registration_year,
          passenger_seats: number_of_seats ?? 4,
          registration_number: registration_plate.toUpperCase(),
          registration_date: `${registration_year}-01-01`,
          updated_at: now,
        },
      }).returning();

      // Keep the driver's dispatch-facing type AND vehicle link in sync with
      // the vehicle row (M-3).
      await tx.update(drivers)
        .set({
          vehicle_type: vehicle_type as any,
          vehicle_id: vehicleRow.id,
          updated_at: now,
        })
        .where(eq(drivers.id, driver.id));

      return { vehicle: vehicleRow, model_created: modelCreated };
    });

    return Response.json({ vehicle, model_created }, { status: 201 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (err instanceof EligibilityError) {
      return Response.json({ error: 'eligibility_not_met', message: err.message }, { status: 422 });
    }
    logger.error('[driver/vehicles] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
