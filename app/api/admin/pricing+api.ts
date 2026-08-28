// Auth: requireAdminPermission via adminRbac
import { db } from "@/src/db";
import { pricing } from "@/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/parseBody";
import { z } from "zod";
import * as errors from "@/lib/errors";

const updateSchema = z.object({
  id: z.string().uuid(),
  base_fare_bdt: z.number().int().nonnegative().optional(),
  per_km_bdt: z.number().int().nonnegative().optional(),
  per_min_bdt: z.number().int().nonnegative().optional(),
  floor_length_km: z.number().nonnegative().optional(),
  floor_min: z.number().int().nonnegative().optional(),
  platform_commission_percent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  brta_fare_ceiling_bdt: z.number().int().nonnegative().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const all = await db
      .select()
      .from(pricing)
      .orderBy(desc(pricing.updated_at));
    return Response.json({ pricing: all });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401 || errors.getErrorStatus(err) === 403) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: errors.getErrorStatus(err) ?? 500 });
    }
    logger.error("[admin/pricing] list error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const result = await parseJsonBody(request, updateSchema);
    if (!result.ok) return result.response;

    const { id, ...updatesRaw } = result.data;
    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const [key, val] of Object.entries(updatesRaw)) {
      if (val === undefined) continue;
      if (key === "floor_length_km") {
        updates[key] = String(val); // numeric(10,2) column expects string
      } else {
        updates[key] = val;
      }
    }
    const [row] = await db
      .update(pricing)
      .set(updates)
      .where(eq(pricing.id, id))
      .returning();

    if (!row)
      return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 404 });
    return Response.json({ pricing: row });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401 || errors.getErrorStatus(err) === 403) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: errors.getErrorStatus(err) ?? 500 });
    }
    logger.error("[admin/pricing] update error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
