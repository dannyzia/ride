// app/api/admin/maps-engine+api.ts
// Maps & Location Engine Management API for dpMaps
import { db } from '@/src/db';
import { platformConfig, configAuditLog } from '@/src/db/schema';
import { inArray } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const DPMAPS_KEYS = [
  'routing_provider_mode',
  'search_provider_mode',
  'dpmaps_osrm_car_url',
  'dpmaps_osrm_bike_url',
  'dpmaps_osrm_cng_url',
  'dpmaps_meilisearch_url',
  'dpmaps_tiles_style_url',
  'dpmaps_osrm_timeout_ms',
  'dpmaps_barikoi_timeout_ms',
  'dpmaps_google_spend_cap_usd',
  'dpmaps_learning_ingest_enabled',
] as const;

export const DEFAULT_MAPS_CONFIG: Record<string, string> = {
  routing_provider_mode: 'shadow',
  search_provider_mode: 'mixed_shadow',
  dpmaps_osrm_car_url: 'http://localhost:5001',
  dpmaps_osrm_bike_url: 'http://localhost:5002',
  dpmaps_osrm_cng_url: 'http://localhost:5003',
  dpmaps_meilisearch_url: 'http://localhost:7700',
  dpmaps_tiles_style_url: 'https://tiles.yourdomain.com/style.json',
  dpmaps_osrm_timeout_ms: '300',
  dpmaps_barikoi_timeout_ms: '400',
  dpmaps_google_spend_cap_usd: '50.00',
  dpmaps_learning_ingest_enabled: 'true',
};

const patchSchema = z.object({
  updates: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
  })).min(1),
});

const actionSchema = z.object({
  action: z.enum(['rollback', 'emergency_rollback']),
  target_mode: z.enum(['shadow', 'off']).optional().default('shadow'),
});

interface ServiceProbeResult {
  status: 'healthy' | 'unreachable' | 'misconfigured';
  latency_ms: number | null;
  message?: string;
}

async function probeUrl(url: string, path = '/health'): Promise<ServiceProbeResult> {
  const start = Date.now();
  try {
    const fullUrl = url.endsWith('/') ? `${url.slice(0, -1)}${path}` : `${url}${path}`;
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(600) });
    const latency = Date.now() - start;
    if (res.ok || res.status === 404 || res.status === 400) {
      // Endpoint is responsive
      return { status: 'healthy', latency_ms: latency };
    }
    return { status: 'unreachable', latency_ms: latency, message: `HTTP ${res.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'unreachable', latency_ms: null, message: msg };
  }
}

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);

    // Fetch existing keys
    const rows = await db
      .select()
      .from(platformConfig)
      .where(inArray(platformConfig.key, [...DPMAPS_KEYS]));

    const config: Record<string, string> = { ...DEFAULT_MAPS_CONFIG };
    for (const r of rows) {
      config[r.key] = r.value;
    }

    // Health probes (parallel, capped at 600ms)
    const [carHealth, bikeHealth, cngHealth, meiliHealth] = await Promise.all([
      probeUrl(config.dpmaps_osrm_car_url, ''),
      probeUrl(config.dpmaps_osrm_bike_url, ''),
      probeUrl(config.dpmaps_osrm_cng_url, ''),
      probeUrl(config.dpmaps_meilisearch_url, '/health'),
    ]);

    const barikoiConfigured = Boolean(process.env.BARIKOI_API_KEY && process.env.BARIKOI_API_KEY.length > 5);

    return Response.json({
      config,
      services_health: {
        osrm_car: carHealth,
        osrm_bike: bikeHealth,
        osrm_cng: cngHealth,
        meilisearch: meiliHealth,
        barikoi: {
          status: barikoiConfigured ? 'healthy' : 'misconfigured',
          latency_ms: barikoiConfigured ? 0 : null,
          message: barikoiConfigured ? 'API Key present' : 'Missing BARIKOI_API_KEY',
        },
      },
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/maps-engine] GET error', err);
    return Response.json({ error: 'internal_error', message: 'Failed to read maps engine config' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission('config.write')(request);
    const parsed = await parseJsonBody(request, patchSchema);

    if (!parsed.ok) {
      return parsed.response;
    }

    const { updates } = parsed.data;
    const allowedSet = new Set<string>(DPMAPS_KEYS);

    for (const u of updates) {
      if (!allowedSet.has(u.key)) {
        return Response.json({ error: 'bad_request', message: `Unknown config key: ${u.key}` }, { status: 400 });
      }
      if (u.key === 'routing_provider_mode' && !['off', 'shadow', 'primary', 'sole', '0', '1', '2', '3'].includes(u.value)) {
        return Response.json({ error: 'bad_request', message: `Invalid routing_provider_mode: ${u.value}` }, { status: 400 });
      }
      if (u.key === 'search_provider_mode' && !['vendor_only', 'mixed_shadow', 'dpmaps_primary', 'dpmaps_sole'].includes(u.value)) {
        return Response.json({ error: 'bad_request', message: `Invalid search_provider_mode: ${u.value}` }, { status: 400 });
      }
      if (u.key === 'dpmaps_learning_ingest_enabled' && !['true', 'false'].includes(u.value)) {
        return Response.json({ error: 'bad_request', message: `dpmaps_learning_ingest_enabled must be 'true' or 'false'` }, { status: 400 });
      }
    }

    // Apply updates
    const updatedKeys: string[] = [];
    for (const u of updates) {
      // Normalize routing numbers to names
      let val = u.value;
      if (u.key === 'routing_provider_mode') {
        if (val === '0') val = 'off';
        else if (val === '1') val = 'shadow';
        else if (val === '2') val = 'primary';
        else if (val === '3') val = 'sole';
      }

      // Fetch old value for audit log
      const existing = await db
        .select()
        .from(platformConfig)
        .where(inArray(platformConfig.key, [u.key]))
        .limit(1);

      const oldValue = existing[0]?.value ?? null;

      // Upsert
      if (existing.length > 0) {
        await db
          .update(platformConfig)
          .set({ value: val, updated_at: new Date() })
          .where(inArray(platformConfig.key, [u.key]));
      } else {
        await db.insert(platformConfig).values({
          key: u.key,
          value: val,
          updated_at: new Date(),
        });
      }

      // Insert audit log
      await db.insert(configAuditLog).values({
        config_key: u.key,
        old_value: oldValue,
        new_value: val,
        admin_id: dbUser.id,
      });

      updatedKeys.push(u.key);
    }

    logger.info('[admin/maps-engine] Config updated', { admin_id: dbUser.id, keys: updatedKeys });
    return Response.json({ ok: true, updated_keys: updatedKeys });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/maps-engine] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'Failed to update maps engine config' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission('config.write')(request);
    const parsed = await parseJsonBody(request, actionSchema);

    if (!parsed.ok) {
      return parsed.response;
    }

    const targetMode = parsed.data.target_mode || 'shadow';

    // Emergency Rollback: atomically force routing to shadow/off and search to vendor_only
    const rollbackUpdates: { key: string; value: string }[] = [
      { key: 'routing_provider_mode', value: targetMode },
      { key: 'search_provider_mode', value: 'vendor_only' },
    ];

    for (const u of rollbackUpdates) {
      const existing = await db
        .select()
        .from(platformConfig)
        .where(inArray(platformConfig.key, [u.key]))
        .limit(1);

      const oldValue = existing[0]?.value ?? null;

      if (existing.length > 0) {
        await db
          .update(platformConfig)
          .set({ value: u.value, updated_at: new Date() })
          .where(inArray(platformConfig.key, [u.key]));
      } else {
        await db.insert(platformConfig).values({
          key: u.key,
          value: u.value,
          updated_at: new Date(),
        });
      }

      await db.insert(configAuditLog).values({
        config_key: u.key,
        old_value: oldValue,
        new_value: u.value,
        admin_id: dbUser.id,
      });
    }

    logger.warn('[admin/maps-engine] Emergency rollback triggered!', {
      admin_id: dbUser.id,
      target_mode: targetMode,
      search_mode: 'vendor_only',
    });

    return Response.json({
      ok: true,
      message: `Emergency rollback executed: Routing set to "${targetMode}", Search set to "vendor_only"`,
      routing_provider_mode: targetMode,
      search_provider_mode: 'vendor_only',
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/maps-engine] POST error', err);
    return Response.json({ error: 'internal_error', message: 'Emergency rollback failed' }, { status: 500 });
  }
}
