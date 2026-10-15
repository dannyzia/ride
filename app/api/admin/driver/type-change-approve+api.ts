// POST /api/admin/driver/type-change-approve
// F15-API-02. Approve or reject driver-initiated vehicle type change requests.
//
// S7 (§7 A1/A3 + F-30/E2 completion): the decision route now matches the
// verification-queue contract it sits beside —
//   * reject accepts the F-30 structured reason (code / field / example) plus an
//     admin-only internal_note, persisted to vehicle_type_changes.reject_details
//     (migration 0075) with reason_text kept for legacy readers;
//   * BOTH decisions write audit_logs (A3) — this route previously wrote none.
// The approval itself is unchanged: drivers.vehicle_type and the vehicle record
// move in ONE transaction, so the request and the live type cannot diverge.
import { db } from '@/src/db';
import { vehicleTypeChanges, drivers, vehicles } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { writeAudit } from '@/lib/auditLog';
import { z } from 'zod';

const schema = z.object({
  change_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  // Free-text reason: kept because it is what the driver-visible copy has used
  // since F-15 (reason_text) and what the queue list renders first.
  reason: z.string().max(500).optional(),
  // F-30 structured rejection (mirrors lib/roleVerification.ts RejectDetails):
  // code names the defect, field names where it is, example shows what an
  // acceptable request looks like. internal_note is admin-only.
  code: z.string().max(60).optional(),
  field: z.string().max(60).optional(),
  example: z.string().max(200).optional(),
  internal_note: z.string().max(500).optional(),
});

/** The applicant-safe payload: internal_note is stripped, never returned. */
function applicantRejectDetails(d: {
  code?: string;
  field?: string;
  example?: string;
  internal_note?: string;
}): Record<string, string | null> | null {
  if (!d.code && !d.field && !d.example && !d.internal_note) return null;
  return { code: d.code ?? null, field: d.field ?? null, example: d.example ?? null };
}

function storedRejectDetails(d: {
  code?: string;
  field?: string;
  example?: string;
  internal_note?: string;
}): Record<string, string | null> | null {
  if (!d.code && !d.field && !d.example && !d.internal_note) return null;
  return {
    code: d.code ?? null,
    field: d.field ?? null,
    example: d.example ?? null,
    internal_note: d.internal_note ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin, dbUser } = await requireAdminPermission('verification.write')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { change_id, action, reason, code, field, example, internal_note } = result.data;

    const [change] = await db
      .select()
      .from(vehicleTypeChanges)
      .where(eq(vehicleTypeChanges.id, change_id))
      .limit(1);
    if (!change) return Response.json({ error: 'change_not_found', message: 'Change record not found' }, { status: 404 });
    if (change.status !== 'pending') {
      return Response.json(
        { error: 'change_already_resolved', message: `Change is already ${change.status}` },
        { status: 422 },
      );
    }

    // Optional-chained: the audit meta is best-effort and must never be the
    // reason a decision fails (see lib/roleVerification.ts requestMeta).
    const ip = request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers?.get('user-agent') ?? null;

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

      await writeAudit({
        adminUserId: dbUser.id,
        action: 'vehicle_type_change_approved',
        entityType: 'vehicle_type_change',
        entityId: change_id,
        oldValue: { status: change.status, vehicle_type: change.old_vehicle_type },
        newValue: { status: 'approved', vehicle_type: change.new_vehicle_type },
        ip,
        userAgent,
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
      const stored = storedRejectDetails({ code, field, example, internal_note });
      const reasonText = reason ?? change.reason_text ?? 'Rejected by admin';

      await db
        .update(vehicleTypeChanges)
        .set({
          status: 'rejected',
          changed_by: dbUser.id,
          reason_text: reasonText,
          reject_details: stored as never,
          updated_at: new Date(),
        })
        .where(eq(vehicleTypeChanges.id, change_id));

      await writeAudit({
        adminUserId: dbUser.id,
        action: 'vehicle_type_change_rejected',
        entityType: 'vehicle_type_change',
        entityId: change_id,
        oldValue: { status: change.status },
        newValue: { status: 'rejected', reason: reasonText, reject: stored },
        ip,
        userAgent,
      });

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
        // The applicant-safe view of the reason (internal_note withheld).
        reason: reasonText,
        reject: applicantRejectDetails({ code, field, example, internal_note }),
      });
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/type-change-approve] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
