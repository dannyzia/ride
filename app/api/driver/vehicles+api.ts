import { db } from '@/src/db';
import { vehicles, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
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
    if (!dbUser) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

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
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/vehicles] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

const vehicleSchema = z.object({
  vehicle_model: z.string().min(1).max(200),
  registration_plate: z.string().min(1).max(50),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  number_of_seats: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const parsed = await parseJsonBody(request, vehicleSchema);
    if (!parsed.ok) return parsed.response;

    const { vehicle_model, registration_plate, vehicle_type, number_of_seats } = parsed.data;

    const parts = vehicle_model.trim().split(/\s+/);
    const manufacturer = parts[0] ?? 'Unknown';
    const yearMatch = parts.find((p) => /^\d{4}$/.test(p));
    const manufacturing_year = yearMatch ? parseInt(yearMatch, 10) : new Date().getFullYear();
    const model = parts.slice(1, yearMatch ? -1 : undefined).join(' ') || manufacturer;

    const now = new Date();
    const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    await db.insert(vehicles).values({
      driver_id: driver.id as any,
      vehicle_type: vehicle_type as any,
      manufacturer,
      model,
      manufacturing_year,
      has_ac: null,
      passenger_seats: number_of_seats ?? 4,
      registration_area: 'dhaka_metro' as any,
      vehicle_class_letter: 'ka' as any,
      registration_number: registration_plate.toUpperCase(),
      registration_date: now,
      fitness_expires_at: oneYearAhead,
      tax_token_expires_at: oneYearAhead,
    } as any).onConflictDoUpdate({
      target: vehicles.driver_id,
      set: {
        vehicle_type: vehicle_type as any,
        manufacturer,
        model,
        manufacturing_year,
        passenger_seats: number_of_seats ?? 4,
        registration_number: registration_plate.toUpperCase(),
        updated_at: now,
      },
    });

    return Response.json({ success: true }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/vehicles] POST error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
