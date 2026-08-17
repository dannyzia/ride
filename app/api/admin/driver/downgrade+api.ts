// Auth: verifySupabaseToken via requireRole
import { db } from '../../../../src/db';
import { drivers, vehicles, vehicleTypeChanges } from '../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { logger } from '../../../../lib/logger';
import { parseJsonBody } from '../../../../lib/parseBody';
import { z } from 'zod';
import { VEHICLE_TYPE_VALUES } from '../../../../lib/vehicleTypes';
import * as errors from '@/lib/errors';

const VEHICLE_TIER: Record<string, number> = {
  bike_basic:     0,
  bike_standard:  1,
  bike_plus:      2,
  cng:            3,
  car_economy:    4,
  car_comfort:    5,
  car_premium:    6,
  car_xl:         7,
};

const schema = z.object({
  driverId: z.string().uuid(),
  new_vehicle_type: z.enum(VEHICLE_TYPE_VALUES),
  reason: z.string().min(10).max(500),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;

    const { driverId, new_vehicle_type, reason } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // Validate downgrade (new type must be lower tier than current)
    const currentTier = VEHICLE_TIER[driver.vehicle_type];
    const newTier = VEHICLE_TIER[new_vehicle_type];
    if (newTier >= currentTier) {
      return Response.json({
        error: 'not_a_downgrade',
        message: `Cannot downgrade from ${driver.vehicle_type} to ${new_vehicle_type}. Must be a lower tier.`,
      }, { status: 422 });
    }

    await db.transaction(async (tx) => {
      // Record the change
      await tx.insert(vehicleTypeChanges).values({
        driver_id:        driverId,
        old_vehicle_type: driver.vehicle_type as any,
        new_vehicle_type: new_vehicle_type as any,
        change_reason:    'admin_downgrade',
        reason_text:      reason,
        changed_by:       admin.id,
        status:           'approved',
        effective_at:     new Date(),
      });

      // Update driver vehicle type immediately (admin downgrades are immediate)
      await tx.update(drivers)
        .set({ vehicle_type: new_vehicle_type as any, updated_at: new Date() })
        .where(eq(drivers.id, driverId));

      // Also update vehicles table if vehicle is registered
      if (driver.vehicle_id) {
        await tx.update(vehicles)
          .set({ vehicle_type: new_vehicle_type as any, updated_at: new Date() })
          .where(eq(vehicles.id, driver.vehicle_id));
      }
    });

    logger.info('[admin/driver/downgrade] vehicle downgraded', {
      driverId, oldType: driver.vehicle_type, newType: new_vehicle_type, reason, adminId: admin.id,
    });

    return Response.json({
      success: true,
      old_vehicle_type: driver.vehicle_type,
      new_vehicle_type,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/downgrade] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
