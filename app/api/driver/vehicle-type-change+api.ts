import { db } from '@/src/db';
import { drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { VEHICLE_TYPE_VALUES, checkDriverEligibility } from '@/lib/vehicleTypes';

const schema = z.object({
  new_vehicle_type: z.enum(VEHICLE_TYPE_VALUES),
});

export async function POST(request: Request) {
  try {
    const { user } = await requireRole('driver')(request);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'invalid_body' }, { status: 400 });

    const { new_vehicle_type } = parsed.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    if (driver.vehicle_type === new_vehicle_type) {
      return Response.json({ error: 'already_current_type' }, { status: 422 });
    }

    // Check driver eligibility for the new vehicle type
    const eligibility = checkDriverEligibility(new_vehicle_type, {
      completed_rides_count: driver.completed_rides_count,
      rating: Number(driver.rating),
    });

    if (!eligibility.eligible) {
      return Response.json({
        error: 'eligibility_not_met',
        message: eligibility.reason,
      }, { status: 422 });
    }

    // Update driver's vehicle type
    await db.update(drivers)
      .set({ vehicle_type: new_vehicle_type as any, updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    return Response.json({ success: true, vehicle_type: new_vehicle_type });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[driver/vehicle-type-change] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
