// Auth: requireAdminPermission via adminRbac
import { db } from "@/src/db";
import { packages, operatorRoleEnum } from "@/src/db/schema";
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
  call_count: z.number().int(),
  duration_days: z.number().int().nullable().optional(),
  price_bdt: z.number().int().nonnegative(),
  is_trial: z.boolean().optional().default(false),
  // Batch-2 Item 1: operator applicability — every element must be an
  // operator_role value; non-empty. Validated (with the pinned
  // applicable_roles_invalid code) in validatePackageConstraints below.
  applicable_roles: z.array(z.string()).optional().default(['driver']),
  // D3-B-r2: commission rate for bundle packages. blank/0 = no commission leg;
  // when set, (0, 100]. Trials carry no percent.
  commission_percent: z.number().min(0).max(100).optional(),
  daily_cap: z.number().int().positive().optional().default(200),
  is_active: z.boolean().optional().default(true),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM.nullable().optional().default(null),
  roles: z.array(z.string()).optional().default(["driver"]),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

/**
 * Package constraints (Item 21 / §3.9, D3-B-r2):
 *   - D1 ceiling side: call-package price_bdt <= max_commission_debt_bdt - 1,000
 *     paisa dust buffer (price 0 trials exempt).
 *   - M-09 price floor: call-package price_bdt == 0 (trial) OR price_bdt >= 1,000.
 *   - D3-B-r2 four-field form: commission_percent blank/0 = no commission leg;
 *     when set, (0, 100]; trials carry no percent. call_count: -1 = unlimited,
 *     0 = no lead leg, positive = finite. duration_days: -1 = unlimited (NULL),
 *     >= 1 = expiring, 0 rejected.
 */
function validatePackageConstraints(data: {
  price_bdt?: number;
  duration_days?: number | null;
  is_trial?: boolean;
  product_type?: string;
  call_count?: number;
  commission_percent?: number;
  applicable_roles?: string[];
}, maxDebtBdt: number): { code: string; message: string } | null {
  const priceBdt = data.price_bdt ?? 0;
  const callCount = data.call_count ?? 5;
  const durationDays = data.duration_days;
  const isTrial = data.is_trial ?? false;
  const commissionPercent = data.commission_percent;

  // Batch-2 Item 1: applicable_roles — non-empty, every element an
  // operator_role enum value ('driver' | 'shop' | 'delivery' | 'fleet').
  if (data.applicable_roles !== undefined) {
    const arr = data.applicable_roles;
    const valid =
      Array.isArray(arr) &&
      arr.length >= 1 &&
      arr.every((r) => (operatorRoleEnum.enumValues as readonly string[]).includes(r));
    if (!valid) {
      return {
        code: 'applicable_roles_invalid',
        message: 'Applicable roles must be a non-empty array of operator roles (driver, shop, delivery, fleet)',
      };
    }
  }

  // D3-B-r2: trials carry no percent
  if (isTrial && commissionPercent != null && commissionPercent > 0) {
    return { code: 'commission_percent_invalid', message: 'Trial packages cannot carry a commission leg' };
  }

  // D3-B-r2: commission_percent blank/0 = no commission leg; when set, (0, 100]
  if (commissionPercent != null && commissionPercent !== 0 && (commissionPercent <= 0 || commissionPercent > 100)) {
    return { code: 'commission_percent_invalid', message: 'Commission percent must be between 0 (exclusive) and 100 (inclusive)' };
  }

  // D1 ceiling side + M-09 price floor
  if (isTrial) {
    if (priceBdt !== 0) {
      return { code: 'package_constraint_violation', message: 'Trial packages must have price_bdt = 0' };
    }
  } else if (priceBdt > 0) {
    if (priceBdt < D1_DUST_BUFFER_BDT) {
      return { code: 'package_constraint_violation', message: 'Call package price_bdt must be 0 (trial) or >= 1,000 paisa' };
    }
    if (priceBdt > maxDebtBdt - D1_DUST_BUFFER_BDT) {
      return { code: 'package_constraint_violation', message: 'Call package price_bdt exceeds max_commission_debt_bdt minus the 1,000 paisa dust buffer (D1 floor)' };
    }
  }

  // D3-B-r2: call_count: -1 = unlimited, 0 = no lead leg, positive = finite
  if (callCount < -1) {
    return { code: 'call_count_invalid', message: 'Call count must be -1 (unlimited), 0 (no lead leg), or positive' };
  }

  // D3-B-r2: duration_days: -1 = unlimited (NULL), >= 1 = expiring, 0 rejected
  if (durationDays === 0 || (durationDays != null && durationDays < -1)) {
    return { code: 'duration_days_invalid', message: 'Duration days must be -1 (unlimited) or >= 1' };
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
      return Response.json({ error: constraintErr.code, message: constraintErr.message }, { status: 400 });
    }

    const { commission_percent, ...insertData } = result.data;
    const [pkg] = await db.insert(packages).values({
      ...insertData,
      ...(commission_percent != null ? { commission_percent: String(commission_percent) } : {}),
    }).returning();
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
      return Response.json({ error: constraintErr.code, message: constraintErr.message }, { status: 400 });
    }

    const { id, commission_percent, ...updates } = result.data;
    const [pkg] = await db
      .update(packages)
      .set({
        ...updates,
        ...(commission_percent != null ? { commission_percent: String(commission_percent) } : {}),
        updated_at: new Date(),
      })
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
