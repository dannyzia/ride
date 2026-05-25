import { db } from '@/src/db';
import { zones, pricing } from '@/src/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { VEHICLE_TYPE_VALUES } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import { z } from 'zod';

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
  per_min_wait_bdt: z.number().int().nonnegative(),
  free_wait_minutes: z.number().int().nonnegative(),
  minimum_fare_bdt: z.number().int().nonnegative(),
  brta_fare_ceiling_bdt: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional().default(true),
});

// GET /api/admin/zones list
export async function GET() {
  try {
    await requireRole('admin')(new Request('http://placeholder'));
    const allZones = await db.select().from(zones).orderBy(desc(zones.created_at));

    const result = [];
    for (const zone of allZones) {
      const pricings = await db.select()
        .from(pricing)
        .where(eq(pricing.zone_id, zone.id));
      result.push({ ...zone, pricing: pricings });
    }
    return Response.json({ zones: result });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/zones] list error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('admin')(request);
    const body = await request.json();

    // Zone creation
    if (body.polygon) {
      const parsed = zoneSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
      }

      // If setting active, deactivate all others
      if (parsed.data.is_active) {
        await db.update(zones).set({ is_active: false }).where(eq(zones.is_active, true));
      }

      const [zone] = await db.insert(zones).values(parsed.data).returning();
      return Response.json({ zone }, { status: 201 });
    }

    // Pricing creation
    if (body.zone_id) {
      const parsed = pricingSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
      }

      const [price] = await db.insert(pricing).values(parsed.data).returning();
      return Response.json({ pricing: price }, { status: 201 });
    }

    return Response.json({ error: 'invalid_payload' }, { status: 400 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/zones] create error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole('admin')(request);
    const body = await request.json();

    if (body.id && body.polygon) {
      const parsed = zoneSchema.partial().extend({ id: z.string().uuid() }).safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
      }

      if (parsed.data.is_active) {
        await db.update(zones).set({ is_active: false }).where(eq(zones.is_active, true));
      }

      const { id, ...updates } = parsed.data;
      const [zone] = await db.update(zones)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(zones.id, id))
        .returning();
      if (!zone) return Response.json({ error: 'zone_not_found' }, { status: 404 });
      return Response.json({ zone });
    }

    // Pricing update
    if (body.id && body.vehicle_type) {
      const parsed = pricingSchema.partial().extend({ id: z.string().uuid() }).safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
      }

      const { id, ...updates } = parsed.data;
      const [price] = await db.update(pricing)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(pricing.id, id))
        .returning();
      if (!price) return Response.json({ error: 'pricing_not_found' }, { status: 404 });
      return Response.json({ pricing: price });
    }

    return Response.json({ error: 'invalid_payload' }, { status: 400 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/zones] update error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole('admin')(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'missing_id' }, { status: 400 });

    await db.delete(zones).where(eq(zones.id, id));
    await db.delete(pricing).where(eq(pricing.zone_id, id));
    return Response.json({ success: true });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/zones] delete error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
