import { db } from '@/src/db';
import { cityBoundaries } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { clearCityBoundaryCache } from '@/lib/cityBoundary';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(2).max(100),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
  is_active: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3).optional(),
  is_active: z.boolean().optional(),
});

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  const { users } = await import('@/src/db/schema');
  const token = authHeader.slice(7);
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.auth_uid, user.id)).limit(1);
  if (!dbUser || dbUser.role !== 'admin') {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return dbUser;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const cities = includeInactive
      ? await db.select().from(cityBoundaries).orderBy(cityBoundaries.name)
      : await db.select().from(cityBoundaries).where(eq(cityBoundaries.is_active, true)).orderBy(cityBoundaries.name);
    return Response.json({ cities });
  } catch (err: any) {
    const status = err.status ?? 500;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/city-boundaries] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const [existing] = await db.select().from(cityBoundaries).where(eq(cityBoundaries.name, parsed.data.name)).limit(1);
    if (existing) {
      return Response.json({ error: 'city_already_exists' }, { status: 409 });
    }

    const [city] = await db.insert(cityBoundaries).values({
      name: parsed.data.name,
      polygon: parsed.data.polygon as any,
      is_active: parsed.data.is_active,
    }).returning();

    clearCityBoundaryCache();
    return Response.json({ city_boundary_id: city.id }, { status: 201 });
  } catch (err: any) {
    const status = err.status ?? 500;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/city-boundaries] POST error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'missing_id' }, { status: 400 });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.polygon !== undefined) updates.polygon = parsed.data.polygon;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const [updated] = await db.update(cityBoundaries).set(updates).where(eq(cityBoundaries.id, id)).returning();
    if (!updated) return Response.json({ error: 'not_found' }, { status: 404 });

    clearCityBoundaryCache();
    return Response.json({ city_boundary_id: updated.id, updated: true });
  } catch (err: any) {
    const status = err.status ?? 500;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/city-boundaries] PATCH error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'missing_id' }, { status: 400 });

    const [updated] = await db.update(cityBoundaries)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(cityBoundaries.id, id))
      .returning();
    if (!updated) return Response.json({ error: 'not_found' }, { status: 404 });

    clearCityBoundaryCache();
    return Response.json({ city_boundary_id: updated.id, is_active: false });
  } catch (err: any) {
    const status = err.status ?? 500;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/city-boundaries] DELETE error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
