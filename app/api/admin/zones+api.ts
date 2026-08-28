// Auth: requireAdminPermission via adminRbac
import { db } from "@/src/db";
import { zones, pricing } from "@/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdminPermission } from '@/lib/adminRbac';
import { VEHICLE_TYPE_VALUES } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { normalizePolygon } from "@/lib/polygon";
import { invalidateZoneCache } from "@/lib/zone";
import { z } from "zod";
import { safeRequestJson } from "@/lib/parseBody";
import * as errors from "@/lib/errors";

const zoneSchema = z.object({
  name: z.string().min(1).max(100),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
  is_active: z.boolean().optional().default(false),
});

const pricingSchema = z.object({
  zone_id: z.string().uuid(),
  vehicle_type: z.enum(VEHICLE_TYPE_VALUES),
  base_fare_bdt: z.number().int().nonnegative(),
  per_km_bdt: z.number().int().nonnegative(),
  per_min_bdt: z.number().int().nonnegative(),
  floor_length_km: z.number().nonnegative(),
  floor_min: z.number().int().nonnegative(),
  brta_fare_ceiling_bdt: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional().default(true),
});

// GET /api/admin/zones list
export async function GET(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const allZones = await db
      .select()
      .from(zones)
      .orderBy(desc(zones.created_at));

    const result = [];
    for (const zone of allZones) {
      const pricings = await db
        .select()
        .from(pricing)
        .where(eq(pricing.zone_id, zone.id));
      result.push({ ...zone, pricing: pricings });
    }
    return Response.json({ zones: result });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/zones] list error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const bodyResult = await safeRequestJson(request);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data as Record<string, unknown>;

    // Zone creation
    if (body.polygon) {
      const parsed = zoneSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "validation_error", message: parsed.error.flatten() },
          { status: 400 },
        );
      }

      // Z-5: validate polygon before insert — reject malformed polygons
      const normalized = normalizePolygon(parsed.data.polygon);
      if (!normalized || normalized.length < 3) {
        return Response.json(
          { error: "invalid_polygon", message: "Zone polygon must have at least 3 valid vertices" },
          { status: 422 },
        );
      }

      // Z-5: no exclusive-activation sweep — multiple zones can be active
      const [zone] = await db.insert(zones).values(parsed.data).returning();
      invalidateZoneCache();
      return Response.json({ zone }, { status: 201 });
    }

    // Pricing creation
    if (body.zone_id) {
      const parsed = pricingSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "validation_error", message: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const insertData = {
        ...parsed.data,
        floor_length_km: String(parsed.data.floor_length_km),
      };
      const [price] = await db.insert(pricing).values(insertData).returning();
      return Response.json({ pricing: price }, { status: 201 });
    }

    return Response.json({ error: 'invalid_payload', message: 'Invalid request payload' }, { status: 400 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/zones] create error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const bodyResult = await safeRequestJson(request);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data as Record<string, unknown>;

    if (body.id && body.polygon) {
      const parsed = zoneSchema
        .partial()
        .extend({ id: z.string().uuid() })
        .safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "validation_error", message: parsed.error.flatten() },
          { status: 400 },
        );
      }

      // Z-5: validate polygon on update if provided
      if (parsed.data.polygon) {
        const normalized = normalizePolygon(parsed.data.polygon);
        if (!normalized || normalized.length < 3) {
          return Response.json(
            { error: "invalid_polygon", message: "Zone polygon must have at least 3 valid vertices" },
            { status: 422 },
          );
        }
      }

      // Z-5: no exclusive-activation sweep — multiple zones can be active
      const { id, ...updates } = parsed.data;
      const [zone] = await db
        .update(zones)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(zones.id, id))
        .returning();
      if (!zone)
        return Response.json({ error: 'zone_not_found', message: 'Zone not found' }, { status: 404 });
      invalidateZoneCache();
      return Response.json({ zone });
    }

    // Pricing update
    if (body.id && body.vehicle_type) {
      const parsed = pricingSchema
        .partial()
        .extend({ id: z.string().uuid() })
        .safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "validation_error", message: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const { id, ...updatesRaw } = parsed.data;
      const updates: Record<string, unknown> = { updated_at: new Date() };
      for (const [key, val] of Object.entries(updatesRaw)) {
        if (val === undefined) continue;
        if (key === "floor_length_km") {
          updates[key] = String(val);
        } else {
          updates[key] = val;
        }
      }
      const [price] = await db
        .update(pricing)
        .set(updates)
        .where(eq(pricing.id, id))
        .returning();
      if (!price)
        return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 404 });
      return Response.json({ pricing: price });
    }

    return Response.json({ error: 'invalid_payload', message: 'Invalid request payload' }, { status: 400 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/zones] update error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: 'missing_id', message: 'ID parameter missing' }, { status: 400 });

    // Soft-delete: deactivate zone and its pricing rows
    await db
      .update(zones)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(zones.id, id));
    await db
      .update(pricing)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(pricing.zone_id, id));
    invalidateZoneCache();
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/zones] delete error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
