// GET / PATCH /api/admin/system-config
// F15-API-03. Operational toggles (separate from platform_config pricing policy).
import { db } from '@/src/db';
import { systemConfig } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const JSON_ARRAY_KEYS = new Set<string>();

const ALLOWED_KEYS = new Set([
  'dispatch_paused',
  'min_app_version',
  'latest_version',
  'apk_download_url',
  'brta_fare_ceiling_bdt',
  'max_free_wait_seconds',
  'stale_arrived_timeout_minutes',
  'sos_police_number',
  'sos_ride_number',
  'geofence_arrival_radius_meters',
  'geofence_arrival_dwell_seconds',
  'face_match_min_score',
  'sos_contacts',
  'sample_vehicle_photo_front',
  'sample_vehicle_photo_left',
  'sample_vehicle_photo_right',
  'sample_vehicle_photo_rear',
  'sample_vehicle_photo_dashboard',
  'sample_vehicle_photo_seats',
  'sample_vehicle_video',
]);

const NUMERIC_KEYS = new Set([
  'brta_fare_ceiling_bdt',
  'max_free_wait_seconds',
  'stale_arrived_timeout_minutes',
  'geofence_arrival_radius_meters',
  'geofence_arrival_dwell_seconds',
  'face_match_min_score',
]);

const BOOLEAN_KEYS = new Set(['dispatch_paused']);

const patchSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string(),
      }),
    )
    .min(1),
});

function validateValue(key: string, value: string): string | null {
  if (!ALLOWED_KEYS.has(key)) return `Unknown key: ${key}`;
  if (NUMERIC_KEYS.has(key)) {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return `${key} must be numeric`;
    if (key === 'face_match_min_score' && (n < 0 || n > 100)) {
      return `${key} must be between 0 and 100`;
    }
    if (key !== 'face_match_min_score' && n < 0) {
      return `${key} must be >= 0`;
    }
  }
  if (BOOLEAN_KEYS.has(key) && value !== 'true' && value !== 'false') {
    return `${key} must be 'true' or 'false'`;
  }
  if (JSON_ARRAY_KEYS.has(key)) {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return `${key} must be a JSON array`;
      if (parsed.length === 0) return `${key}: must have at least one tier`;
      for (const item of parsed) {
        if (typeof item.ratio !== 'number' || item.ratio <= 0) {
          return `${key}: ratio must be > 0 (got ${item.ratio})`;
        }
        if (typeof item.multiplier !== 'number' || item.multiplier < 1.0) {
          return `${key}: multiplier must be >= 1.0 (got ${item.multiplier})`;
        }
      }
    } catch {
      return `${key} must be valid JSON`;
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const rows = await db.select().from(systemConfig);
    return Response.json({ config: rows });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/system-config] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);
    const result = await parseJsonBody(request, patchSchema);
    if (!result.ok) return result.response;

    // Validate all keys first
    const errors: string[] = [];
    for (const { key, value } of result.data.updates) {
      const err = validateValue(key, value);
      if (err) errors.push(err);
    }
    if (errors.length) {
      return Response.json(
        { error: 'validation_failed', message: errors.join('; ') },
        { status: 400 },
      );
    }

    // Upsert each key
    for (const { key, value } of result.data.updates) {
      const [existing] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, key))
        .limit(1);
      if (existing) {
        await db
          .update(systemConfig)
          .set({ value, updated_at: new Date() })
          .where(eq(systemConfig.key, key));
      } else {
        await db.insert(systemConfig).values({ key, value });
      }
    }

    logger.info('[admin/system-config] updated', {
      keys: result.data.updates.map((u) => u.key),
      adminId: admin.id,
    });

    const config = await db.select().from(systemConfig);
    return Response.json({ config });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/system-config] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
