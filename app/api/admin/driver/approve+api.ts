// POST /api/admin/driver/approve
// F15-API-02. Approve a driver with optional vehicle type adjustment.
import { db } from '@/src/db';
import {
  drivers,
  documents,
  vehicles,
  vehicleTypeChanges,
} from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { VEHICLE_TYPE_ZOD_ENUM } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const schema = z.object({
  driver_id: z.string().uuid(),
  new_status: z.enum(['active', 'temporary']).optional(),
  vehicle_type_adjusted: VEHICLE_TYPE_ZOD_ENUM.optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin, dbUser } = await requireAdminPermission('verification.write')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id, new_status, vehicle_type_adjusted, reason } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // Decide final status: explicit override, else active (admin confirms full review)
    const finalStatus = new_status ?? 'active';
    const updates: Record<string, unknown> = {
      status: finalStatus,
      updated_at: new Date(),
    };

    let provisionalExpiresAt: Date | null = null;
    if (finalStatus === 'temporary') {
      provisionalExpiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
      updates.provisional_expires_at = provisionalExpiresAt;
      updates.stage2_due_at = provisionalExpiresAt;
    } else {
      // active: clear any provisional deadline
      updates.provisional_expires_at = null;
      updates.stage2_due_at = null;
    }

    let vehicleTypeAdjusted = false;
    let adjustedTo: string | null = null;

    await db.transaction(async (tx) => {
      // Mark all pending documents as approved
      await tx
        .update(documents)
        .set({
          status: 'approved',
          reviewed_by: dbUser.id,
          reviewed_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(documents.driver_id, driver_id),
            eq(documents.status, 'pending'),
          ),
        );

      if (vehicle_type_adjusted && vehicle_type_adjusted !== driver.vehicle_type) {
        const oldType = driver.vehicle_type;
        await tx
          .update(drivers)
          .set({ ...updates, vehicle_type: vehicle_type_adjusted })
          .where(eq(drivers.id, driver_id));

        if (driver.vehicle_id) {
          await tx
            .update(vehicles)
            .set({ vehicle_type: vehicle_type_adjusted, updated_at: new Date() })
            .where(eq(vehicles.id, driver.vehicle_id));
        }

        await tx.insert(vehicleTypeChanges).values({
          driver_id,
          old_vehicle_type: oldType as never,
          new_vehicle_type: vehicle_type_adjusted as never,
          change_reason: 'admin_approval_adjustment',
          reason_text: reason ?? 'Adjusted during admin approval',
          changed_by: dbUser.id,
          status: 'approved',
          effective_at: new Date(),
        });

        vehicleTypeAdjusted = true;
        adjustedTo = vehicle_type_adjusted;
      } else {
        await tx.update(drivers).set(updates).where(eq(drivers.id, driver_id));
      }
    });

    logger.info('[admin/driver/approve] approved', {
      driverId: driver_id,
      finalStatus,
      vehicleTypeAdjusted,
      adjustedTo,
      adminId: admin.id,
    });

    return Response.json({
      driver_id,
      new_status: finalStatus,
      provisional_expires_at: provisionalExpiresAt,
      vehicle_type_adjusted: vehicleTypeAdjusted,
      adjusted_to: adjustedTo,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/approve] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
