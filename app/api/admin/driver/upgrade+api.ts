// POST /api/admin/driver/upgrade
// F15-API-02. Admin-initiated vehicle type upgrade.
import { db } from '@/src/db';
import { drivers, vehicles, vehicleTypeChanges } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { VEHICLE_TYPE_ZOD_ENUM, VEHICLE_TIER_ORDER } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';



const schema = z.object({
  driver_id: z.string().uuid(),
  new_vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  reason: z.string().min(10).max(500),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin, dbUser } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id, new_vehicle_type, reason } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const currentTier = VEHICLE_TIER_ORDER[driver.vehicle_type as keyof typeof VEHICLE_TIER_ORDER];
    const newTier = VEHICLE_TIER_ORDER[new_vehicle_type];
    if (newTier <= currentTier) {
      return Response.json(
        {
          error: 'not_an_upgrade',
          message: `Cannot upgrade from ${driver.vehicle_type} to ${new_vehicle_type}. New type must be higher tier.`,
        },
        { status: 422 },
      );
    }

    await db.transaction(async (tx) => {
      await tx.insert(vehicleTypeChanges).values({
        driver_id,
        old_vehicle_type: driver.vehicle_type as never,
        new_vehicle_type: new_vehicle_type as never,
        change_reason: 'admin_upgrade',
        reason_text: reason,
        changed_by: dbUser.id,
        status: 'approved',
        effective_at: new Date(),
      });

      await tx
        .update(drivers)
        .set({ vehicle_type: new_vehicle_type as never, updated_at: new Date() })
        .where(eq(drivers.id, driver_id));

      if (driver.vehicle_id) {
        await tx
          .update(vehicles)
          .set({ vehicle_type: new_vehicle_type as never, updated_at: new Date() })
          .where(eq(vehicles.id, driver.vehicle_id));
      }
    });

    logger.info('[admin/driver/upgrade] upgraded', {
      driverId: driver_id,
      oldType: driver.vehicle_type,
      newType: new_vehicle_type,
      reason,
      adminId: admin.id,
    });

    return Response.json({
      driver_id,
      old_vehicle_type: driver.vehicle_type,
      new_vehicle_type,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/upgrade] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
