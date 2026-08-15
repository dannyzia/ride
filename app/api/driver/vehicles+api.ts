import { db } from '@/src/db';
import { vehicles, vehicleModels, drivers, users } from '@/src/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { VEHICLE_TYPE_ZOD_ENUM } from '@/lib/vehicleTypes';

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
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
      is_active: true,
    }));

    return Response.json({ vehicles: result }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
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

    const [driver] = await db.select({ id: drivers.id })
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

    let model_created = false;
    if (!existingModel) {
      await db.insert(vehicleModels).values({
        brand,
        model,
        source: 'driver',
        created_by: dbUser.id,
        is_active: false,
        default_vehicle_type: vehicle_type as any,
        passenger_seats: number_of_seats ?? 4,
      }).onConflictDoNothing();
      model_created = true;
    }

    const now = new Date();
    const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    const [vehicle] = await db.insert(vehicles).values({
      driver_id: driver.id,
      vehicle_type: vehicle_type as any,
      manufacturer: brand,
      model,
      // TODO: manufacturing_year = BRTA registration year placeholder (UI collects
      // only one year) — admin-correctable
      manufacturing_year: registration_year,
      has_ac: null,
      passenger_seats: number_of_seats ?? 4,
      // TODO: registration_area is a NOT NULL placeholder — admin-correctable
      registration_area: 'DHAKA_METRO' as any,
      // TODO: vehicle_class_letter is a NOT NULL placeholder — admin-correctable
      vehicle_class_letter: 'KA' as any,
      registration_number: registration_plate.toUpperCase(),
      // Jan 1 of the BRTA registration year (UI collects only the year)
      registration_date: `${registration_year}-01-01`,
      // TODO: fitness expiry +1yr placeholder — admin-correctable
      fitness_expires_at: toDateStr(oneYearAhead),
      // TODO: tax token expiry +1yr placeholder — admin-correctable
      tax_token_expires_at: toDateStr(oneYearAhead),
    }).onConflictDoUpdate({
      target: vehicles.driver_id,
      set: {
        vehicle_type: vehicle_type as any,
        manufacturer: brand,
        model,
        // TODO: manufacturing_year = BRTA registration year placeholder (UI collects
        // only one year) — admin-correctable
        manufacturing_year: registration_year,
        passenger_seats: number_of_seats ?? 4,
        registration_number: registration_plate.toUpperCase(),
        // Jan 1 of the BRTA registration year (UI collects only the year)
        registration_date: `${registration_year}-01-01`,
        updated_at: now,
      },
    }).returning();

    return Response.json({ vehicle, model_created }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/vehicles] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
