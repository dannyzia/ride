// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { packages } from "@/src/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { parseJsonBody } from "@/lib/parseBody";
import * as errors from "@/lib/errors";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  call_count: z.number().int().positive(),
  duration_days: z.number().int().positive(),
  price_bdt: z.number().int().nonnegative(),
  is_trial: z.boolean().optional().default(false),
  daily_cap: z.number().int().positive().optional().default(200),
  is_active: z.boolean().optional().default(true),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM.nullable().optional().default(null),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    await requireRole("admin")(request);
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
    await requireRole("admin")(request);
    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;

    const [pkg] = await db.insert(packages).values(result.data).returning();
    return Response.json({ package: pkg }, { status: 201 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/packages] create error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole("admin")(request);
    const result = await parseJsonBody(request, updateSchema);
    if (!result.ok) return result.response;

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
    logger.error("[admin/packages] update error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole("admin")(request);
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
