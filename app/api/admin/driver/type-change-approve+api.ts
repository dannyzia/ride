// POST /api/admin/driver/type-change-approve
// F15-API-02. Approve or reject driver-initiated vehicle type change requests.
import { db } from '@/src/db';
import { vehicleTypeChanges, drivers, vehicles } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const schema = z.object({
  change_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin, dbUser } = await requireRole('admin')(request);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'validation_error', message: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { change_id, action, reason } = parsed.data;

    const [change] = await db
      .select()
      .from(vehicleTypeChanges)
      .where(eq(vehicleTypeChanges.id, change_id))
      .limit(1);
    if (!change) return Response.json({ error: 'change_not_found' }, { status: 404 });
    if (change.status !== 'pending') {
      return Response.json(
        { error: 'change_already_resolved', message: `Change is already ${change.status}` },
        { status: 422 },
      );
    }

    if (action === 'approve') {
      await db.transaction(async (tx) => {
        await tx
          .update(vehicleTypeChanges)
          .set({
            status: 'approved',
            effective_at: new Date(),
            changed_by: dbUser.id,
            updated_at: new Date(),
          })
          .where(eq(vehicleTypeChanges.id, change_id));

        await tx
          .update(drivers)
          .set({
            vehicle_type: change.new_vehicle_type as never,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, change.driver_id));

        const [vehicle] = await tx
          .select()
          .from(vehicles)
          .where(eq(vehicles.driver_id, change.driver_id))
          .limit(1);
        if (vehicle) {
          await tx
            .update(vehicles)
            .set({
              vehicle_type: change.new_vehicle_type as never,
              updated_at: new Date(),
            })
            .where(eq(vehicles.id, vehicle.id));
        }
      });

      logger.info('[admin/driver/type-change-approve] approved', {
        changeId: change_id,
        driverId: change.driver_id,
        oldType: change.old_vehicle_type,
        newType: change.new_vehicle_type,
        adminId: admin.id,
      });

      return Response.json({
        change_id,
        status: 'approved',
        driver_id: change.driver_id,
        new_vehicle_type: change.new_vehicle_type,
      });
    } else {
      await db
        .update(vehicleTypeChanges)
        .set({
          status: 'rejected',
          changed_by: dbUser.id,
          reason_text: reason ?? change.reason_text ?? 'Rejected by admin',
          updated_at: new Date(),
        })
        .where(eq(vehicleTypeChanges.id, change_id));

      logger.info('[admin/driver/type-change-approve] rejected', {
        changeId: change_id,
        driverId: change.driver_id,
        reason,
        adminId: admin.id,
      });

      return Response.json({
        change_id,
        status: 'rejected',
        driver_id: change.driver_id,
      });
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/driver/type-change-approve] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
