// Auth: requireAdminPermission via adminRbac
import { db } from "@/src/db";
import { packages } from "@/src/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from "@/lib/logger";
import { z } from "zod";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { parseJsonBody } from "@/lib/parseBody";
import * as errors from "@/lib/errors";
import { getMaxCommissionDebtBdt } from "@/lib/platformConfig";

const D1_DUST_BUFFER_BDT = 1_000; // PortPos settlement minimum — dust buffer

const createSchema = z.object({
  name: z.string().min(1).max(100),
  product_type: z.enum(['call_package', 'commission']).default('call_package'),
  call_count: z
    .number()
    .int()
    .refine((n) => n === -1 || n > 0, "Must be positive or -1 for unlimited"),
  duration_days: z.number().int().nonnegative().nullable().optional(),
  price_bdt: z.number().int().nonnegative(),
  is_trial: z.boolean().optional().default(false),
  daily_cap: z.number().int().positive().optional().default(200),
  is_active: z.boolean().optional().default(true),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM.nullable().optional().default(null),
  roles: z.array(z.string()).optional().default(["driver"]),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

/**
 * Package constraints (Item 21 / §3.9):
 *   - D1 ceiling side: call-package price_bdt <= max_commission_debt_bdt - 1,000
 *     paisa dust buffer (price 0 trials exempt).
 *   - M-09 price floor: call-package price_bdt == 0 (trial) OR price_bdt >= 1,000.
 *   - D3 commission package: price_bdt = 0, duration_days NULL, is_trial false,
 *     product_type='commission'.
 */
function validatePackageConstraints(data: { price_bdt?: number; duration_days?: number | null; is_trial?: boolean; product_type?: string }, maxDebtBdt: number): string | null {
  const productType = data.product_type ?? 'call_package';
  const priceBdt = data.price_bdt ?? 0;

  if (productType === 'commission') {
    if (data.price_bdt !== undefined && data.price_bdt !== 0) return 'commission package price_bdt must be 0';
    if (data.duration_days !== undefined && data.duration_days !== null) return 'commission package duration_days must be NULL';
    if (data.is_trial === true) return 'commission package is_trial must be false';
    return null;
  }

  // call_package
  if (priceBdt > 0) {
    if (priceBdt < D1_DUST_BUFFER_BDT) return 'call package price_bdt must be 0 (trial) or >= 1,000 paisa';
    if (priceBdt > maxDebtBdt - D1_DUST_BUFFER_BDT) return 'call package price_bdt exceeds max_commission_debt_bdt minus the 1,000 paisa dust buffer (D1 floor)';
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const all = await db
      .select()
      .from(packages)
      .where(isNull(packages.deleted_at))
      .orderBy(desc(packages.created_at));
    return Response.json({ packages: all });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/packages] list error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;

    const maxDebtBdt = await getMaxCommissionDebtBdt();
    const constraintErr = validatePackageConstraints(result.data, maxDebtBdt);
    if (constraintErr) {
      return Response.json({ error: 'package_constraint_violation', message: constraintErr }, { status: 400 });
    }

    const [pkg] = await db.insert(packages).values(result.data).returning();
    return Response.json({ package: pkg }, { status: 201 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    // packages_name_live_uq (migration 0057): a LIVE package already holds this
    // name. Previously this was silently allowed and produced duplicate plan
    // rows; it is a conflict, not a server fault.
    if (errors.getErrorCode(err) === '23505')
      return Response.json(
        { error: 'package_name_taken', message: 'A live package with this name already exists' },
        { status: 409 },
      );
    logger.error("[admin/packages] create error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const result = await parseJsonBody(request, updateSchema);
    if (!result.ok) return result.response;

    const maxDebtBdt = await getMaxCommissionDebtBdt();
    const constraintErr = validatePackageConstraints(result.data, maxDebtBdt);
    if (constraintErr) {
      return Response.json({ error: 'package_constraint_violation', message: constraintErr }, { status: 400 });
    }

    const { id, ...updates } = result.data;
    const [pkg] = await db
      .update(packages)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(packages.id, id))
      .returning();

    if (!pkg)
      return Response.json({ error: 'package_not_found', message: 'Call package not found' }, { status: 404 });
    return Response.json({ package: pkg });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    // Renaming onto a live package's name now trips packages_name_live_uq.
    if (errors.getErrorCode(err) === '23505')
      return Response.json(
        { error: 'package_name_taken', message: 'A live package with this name already exists' },
        { status: 409 },
      );
    logger.error("[admin/packages] update error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: 'missing_id', message: 'ID parameter missing' }, { status: 400 });

    await db
      .update(packages)
      .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
      .where(eq(packages.id, id));

    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/packages] delete error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
