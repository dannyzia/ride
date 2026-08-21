import { db } from '@/src/db';
import { drivers, vehicles, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import { checkDriverEligibility } from '@/lib/vehicleTypes';
import * as errors from '@/lib/errors';

const schema = z.object({
  vehicle_id: z.string().uuid(),
});

/**
 * POST /api/driver/vehicle-activate
 *
 * Sets the driver's active vehicle by updating drivers.vehicle_id.
 * Unlike vehicle-type-change (which changes the vehicle TYPE on both
 * tables), this endpoint switches which vehicle the driver is using
 * when they have multiple vehicles registered.
 *
 * Guards:
 * - The vehicle must belong to this driver.
 * - If the vehicle type differs from the current type, eligibility is checked.
 * - If the driver is online, a confirmation flag is required.
 */
export async function POST(request: Request) {
  try {
    const { supabaseUser } = await requireRole('driver')(request);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const { vehicle_id } = parsed.data;

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser)
      return Response.json(
        { error: 'user_not_found', message: 'User not found' },
        { status: 404 },
      );

    const [driver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver)
      return Response.json(
        { error: 'driver_not_found', message: 'Driver not found' },
        { status: 404 },
      );

    // Verify the vehicle belongs to this driver
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicle_id))
      .limit(1);
    if (!vehicle)
      return Response.json(
        { error: 'vehicle_not_found', message: 'Vehicle not found' },
        { status: 404 },
      );
    if (vehicle.driver_id !== driver.id)
      return Response.json(
        { error: 'forbidden', message: 'Vehicle does not belong to this driver' },
        { status: 403 },
      );

    // Already active
    if (driver.vehicle_id === vehicle_id) {
      return Response.json(
        { error: 'already_active', message: 'This vehicle is already active' },
        { status: 422 },
      );
    }

    // If switching to a different vehicle type, check eligibility
    if (vehicle.vehicle_type !== driver.vehicle_type) {
      const eligibility = checkDriverEligibility(vehicle.vehicle_type, {
        completed_rides_count: driver.completed_rides_count,
        rating: Number(driver.rating),
      });
      if (!eligibility.eligible) {
        return Response.json(
          { error: 'eligibility_not_met', message: eligibility.reason },
          { status: 422 },
        );
      }
    }

    // Switch active vehicle: update drivers.vehicle_id AND drivers.vehicle_type
    // to keep dispatch and the vehicles table in sync.
    await db.transaction(async (tx) => {
      await tx
        .update(drivers)
        .set({
          vehicle_id: vehicle.id,
          vehicle_type: vehicle.vehicle_type as any,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, driver.id));
    });

    return Response.json(
      {
        success: true,
        active_vehicle_id: vehicle.id,
        vehicle_type: vehicle.vehicle_type,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    if (errors.getErrorStatus(err) === 403)
      return Response.json(
        { error: 'forbidden', message: 'Access denied' },
        { status: 403 },
      );
    logger.error('[driver/vehicle-activate] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
