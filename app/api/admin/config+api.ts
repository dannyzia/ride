// Auth: verifySupabaseToken via requireRole
import { db } from '../../../src/db';
import { platformConfig } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/auth';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';

const patchSchema = z.object({
  updates: z.array(z.object({ key: z.string().min(1), value: z.string() })).min(1),
});

const ALLOWED_KEYS = new Set([
  'driver_min_ratio',
  'driver_max_ratio',
  'brta_max_base_bdt',
  'brta_max_per_km_bdt',
  'brta_max_wait_per_2min_bdt',
  'zone_multi_active_enabled',
  // Plan-05 operational bounds
  'sos_cooldown_seconds',
  'sos_auto_resolve_seconds',
  'schedule_min_lead_minutes',
  'schedule_max_lead_days',
  'cancel_grace_period_seconds',
]);

const BOOLEAN_KEYS = new Set(['zone_multi_active_enabled']);

export async function GET(req: Request) {
  await requireRole('admin')(req);

  const config = await db.select().from(platformConfig);
  return Response.json({ config });
}

export async function PATCH(req: Request) {
  await requireRole('admin')(req);

  const result = await parseJsonBody(req, patchSchema);
  if (!result.ok) return result.response;
  const body = result.data;

  const errors: string[] = [];
  for (const { key, value } of body.updates) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Unknown key: ${key}`);
      continue;
    }
    if (BOOLEAN_KEYS.has(key)) {
      if (value !== 'true' && value !== 'false') {
        errors.push(`${key} must be 'true' or 'false'`);
        continue;
      }
    } else if (isNaN(parseFloat(value))) {
      errors.push(`Value for ${key} must be numeric, got: ${value}`);
      continue;
    }
    if ((key === 'driver_min_ratio' || key === 'driver_max_ratio')) {
      const v = parseFloat(value);
      if (v < 0.10 || v > 5.00) {
        errors.push(`${key} must be between 0.10 and 5.00`);
        continue;
      }
    }
    if (key === 'sos_cooldown_seconds') {
      const v = parseFloat(value);
      if (!Number.isInteger(v) || v < 0 || v > 7200) {
        errors.push('sos_cooldown_seconds must be 0–7200 (0–2 hours)');
        continue;
      }
    }
    if (key === 'sos_auto_resolve_seconds') {
      const v = parseFloat(value);
      if (!Number.isInteger(v) || v < 60 || v > 14400) {
        errors.push('sos_auto_resolve_seconds must be 60–14400 (1 min – 4 hours)');
        continue;
      }
    }
    if (key === 'schedule_min_lead_minutes') {
      const v = parseFloat(value);
      if (!Number.isInteger(v) || v < 5 || v > 120) {
        errors.push('schedule_min_lead_minutes must be 5–120');
        continue;
      }
    }
    if (key === 'schedule_max_lead_days') {
      const v = parseFloat(value);
      if (!Number.isInteger(v) || v < 1 || v > 30) {
        errors.push('schedule_max_lead_days must be 1–30');
        continue;
      }
    }
    if (key === 'cancel_grace_period_seconds') {
      const v = parseFloat(value);
      if (!Number.isInteger(v) || v < 0 || v > 600) {
        errors.push('cancel_grace_period_seconds must be 0–600 (0–10 min)');
        continue;
      }
    }
  }
  if (errors.length) return Response.json({ error: 'validation_failed', message: errors.join('; ') }, { status: 400 });

  for (const { key, value } of body.updates) {
    if (!ALLOWED_KEYS.has(key)) continue;
    await db.update(platformConfig)
      .set({ value, updated_at: new Date() })
      .where(eq(platformConfig.key, key));
  }

  const config = await db.select().from(platformConfig);
  return Response.json({ config });
}
