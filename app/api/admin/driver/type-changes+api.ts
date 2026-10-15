/**
 * GET /api/admin/driver/type-changes — the vehicle-type change QUEUE (S7 §7).
 *
 * F-22 is the driver-side request (it lands a `vehicle_type_changes` row with
 * status 'pending'); this is the admin side the F-30/E2 completion order names.
 * The list was absent before S7 — the existing decision route
 * (app/api/admin/driver/type-change-approve+api.ts) could only be called with a
 * change_id an admin had no way to discover in the UI.
 *
 * RBAC (§7 A2): the LIST is `admin.read`, so ops_manager and moderator see the
 * queue read-only. Decisions are `verification.write` (the permission the
 * existing route already enforces — no new catalog entry was needed, and
 * inventing `vehicletype.manage` would have left that route and this one
 * gated differently on the same object).
 *
 * Query: ?status=pending|approved|rejected|cooling_off|all (default pending)
 *        &page=1&limit=20
 */
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { vehicleTypeChanges, drivers, users } from '@/src/db/schema';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const CHANGE_STATUSES = ['pending', 'approved', 'rejected', 'cooling_off'] as const;

const querySchema = z.object({
  status: z.enum([...CHANGE_STATUSES, 'all']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(
        { error: 'invalid_param', message: `status must be one of: ${[...CHANGE_STATUSES, 'all'].join(', ')}` },
        { status: 400 },
      );
    }
    const { status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    // `status` is a free varchar(20) on this table (not an enum), so the
    // 'all' case is expressed as an absent predicate rather than a cast.
    const where = status === 'all' ? undefined : eq(vehicleTypeChanges.status, status);

    const rows = await db
      .select({
        change_id: vehicleTypeChanges.id,
        driver_id: vehicleTypeChanges.driver_id,
        driver_name: users.name,
        driver_phone: users.phone,
        old_vehicle_type: vehicleTypeChanges.old_vehicle_type,
        new_vehicle_type: vehicleTypeChanges.new_vehicle_type,
        change_reason: vehicleTypeChanges.change_reason,
        reason_text: vehicleTypeChanges.reason_text,
        status: vehicleTypeChanges.status,
        reject_details: vehicleTypeChanges.reject_details,
        effective_at: vehicleTypeChanges.effective_at,
        created_at: vehicleTypeChanges.created_at,
        // The LIVE type, so a reviewer can see drift between the request and
        // what the driver currently runs (a second approved request, etc.).
        current_vehicle_type: drivers.vehicle_type,
      })
      .from(vehicleTypeChanges)
      .innerJoin(drivers, eq(drivers.id, vehicleTypeChanges.driver_id))
      .innerJoin(users, eq(users.id, drivers.user_id))
      .where(where)
      .orderBy(desc(vehicleTypeChanges.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicleTypeChanges)
      .where(where);

    return Response.json({
      changes: rows,
      total: countResult?.count ?? 0,
      page,
      limit,
      status,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/type-changes] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
