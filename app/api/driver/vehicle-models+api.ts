import { db } from '@/src/db';
import { vehicleModels, drivers, users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { VEHICLE_TYPE_ZOD_ENUM } from '@/lib/vehicleTypes';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const url = new URL(request.url);
    const vehicleTypeParam = url.searchParams.get('vehicle_type');

    let vehicleType: string | undefined;
    if (vehicleTypeParam !== null) {
      const parsed = VEHICLE_TYPE_ZOD_ENUM.safeParse(vehicleTypeParam);
      if (!parsed.success) {
        return Response.json(
          { error: 'invalid_vehicle_type', message: `Unknown vehicle type: ${vehicleTypeParam}` },
          { status: 400 },
        );
      }
      vehicleType = parsed.data;
    }

    const rows = await db.select({
      id: vehicleModels.id,
      brand: vehicleModels.brand,
      model: vehicleModels.model,
      year_start: vehicleModels.year_start,
      year_end: vehicleModels.year_end,
      default_vehicle_type: vehicleModels.default_vehicle_type,
    })
      .from(vehicleModels)
      .where(
        vehicleType
          ? and(eq(vehicleModels.is_active, true), eq(vehicleModels.default_vehicle_type, vehicleType as any))
          : eq(vehicleModels.is_active, true),
      )
      .orderBy(vehicleModels.brand, vehicleModels.model);

    return Response.json({ models: rows }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/vehicle-models] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
