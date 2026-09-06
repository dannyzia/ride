// GET / POST / DELETE /api/admin/hotspots
// Hotspot tier assignments on the existing zone_heat table (Fare Framework
// v1 storage — no new tables). Tiers are advisory demand labels for the
// rider/driver hotspot surface; they never touch dispatch ordering or fares.
//
// Storage mapping: tier low|medium|high ↔ zone_heat.tag cold|neutral|hot.
// valid_from/valid_to bound an admin-pinned assignment in time; NULL means
// "until the heat engine's next recomputation of this zone".
//
// Auth: config.write (owner, admin). Moderator gets 403.
import { db } from '@/src/db';
import { zoneHeat, zones } from '@/src/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { tagFromTier, clearHotspotCache } from '@/lib/hotspot';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const tierSchema = z.enum(['low', 'medium', 'high']);

const postSchema = z
  .object({
    items: z
      .array(
        z.object({
          zone_id: z.string().uuid(),
          tier: tierSchema,
          valid_from: z.string().datetime({ offset: true }).optional(),
          valid_to: z.string().datetime({ offset: true }).optional(),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (body) =>
      body.items.every(
        (item) =>
          !item.valid_from ||
          !item.valid_to ||
          new Date(item.valid_from).getTime() < new Date(item.valid_to).getTime(),
      ),
    { message: 'valid_from must be earlier than valid_to' },
  );

export async function GET(request: Request) {
  try {
    await requireAdminPermission('config.write')(request);

    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const rows = await db
      .select({
        zone_id: zoneHeat.zone_id,
        zone_name: zones.name,
        zone_is_active: zones.is_active,
        tag: zoneHeat.tag,
        score: zoneHeat.score,
        idle_driver_count: zoneHeat.idle_driver_count,
        valid_from: zoneHeat.valid_from,
        valid_to: zoneHeat.valid_to,
        computed_at: zoneHeat.computed_at,
        updated_at: zoneHeat.updated_at,
      })
      .from(zoneHeat)
      .innerJoin(zones, eq(zoneHeat.zone_id, zones.id))
      .orderBy(desc(zoneHeat.updated_at))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(zoneHeat);

    return Response.json({ hotspots: rows, total: count, limit, offset });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/hotspots] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('config.write')(request);

    const result = await parseJsonBody(request, postSchema);
    if (!result.ok) return result.response;
    const { items } = result.data;

    // Dedupe zone_ids inside the batch (later wins) so the upsert loop is
    // deterministic.
    const byZone = new Map<string, (typeof items)[number]>();
    for (const item of items) byZone.set(item.zone_id, item);

    const zoneIds = [...byZone.keys()];
    const existingZones = await db
      .select({ id: zones.id })
      .from(zones)
      .where(inArray(zones.id, zoneIds));
    const existingIds = new Set(existingZones.map((z) => z.id));
    const missing = zoneIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      return Response.json(
        { error: 'unknown_zone', message: `Unknown zone_id: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    const now = new Date();
    for (const [zoneId, item] of byZone) {
      const tag = tagFromTier(item.tier);
      await db
        .insert(zoneHeat)
        .values({
          zone_id: zoneId,
          tag,
          valid_from: item.valid_from ? new Date(item.valid_from) : null,
          valid_to: item.valid_to ? new Date(item.valid_to) : null,
          computed_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: zoneHeat.zone_id,
          set: {
            tag,
            valid_from: item.valid_from ? new Date(item.valid_from) : null,
            valid_to: item.valid_to ? new Date(item.valid_to) : null,
            updated_at: now,
          },
        });
    }

    // Hotspot reads are cached per H3 res-8 cell — bust so tier changes are
    // visible immediately.
    clearHotspotCache();

    logger.info('[admin/hotspots] tiers assigned', {
      count: byZone.size,
      adminId: admin.id,
    });

    return Response.json({ added: byZone.size });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/hotspots] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('config.write')(request);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: 'invalid_uuid', message: 'id must be a UUID' }, { status: 400 });
    }

    const deleted = await db
      .delete(zoneHeat)
      .where(eq(zoneHeat.zone_id, parsedId.data))
      .returning({ zone_id: zoneHeat.zone_id });

    if (deleted.length === 0) {
      return Response.json({ error: 'not_found', message: 'Hotspot row not found' }, { status: 404 });
    }

    clearHotspotCache();
    logger.info('[admin/hotspots] row deleted', {
      zoneId: parsedId.data,
      adminId: admin.id,
    });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/hotspots] DELETE error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
