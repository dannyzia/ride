import { db } from '../../../src/db';
import { platformConfig } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/auth';

const ALLOWED_KEYS = new Set([
  'driver_min_ratio',
  'driver_max_ratio',
  'brta_max_base_bdt',
  'brta_max_per_km_bdt',
  'brta_max_wait_per_2min_bdt',
]);

export async function GET(req: Request) {
  await requireRole('admin')(req);

  const config = await db.select().from(platformConfig);
  return Response.json({ config });
}

export async function PATCH(req: Request) {
  await requireRole('admin')(req);

  const body = await req.json() as { updates: Array<{ key: string; value: string }> };
  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return Response.json({ error: 'updates must be a non-empty array' }, { status: 400 });
  }

  const errors: string[] = [];
  for (const { key, value } of body.updates) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Unknown key: ${key}`);
      continue;
    }
    if (isNaN(parseFloat(value))) {
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
  }
  if (errors.length) return Response.json({ errors }, { status: 400 });

  for (const { key, value } of body.updates) {
    if (!ALLOWED_KEYS.has(key)) continue;
    await db.update(platformConfig)
      .set({ value, updated_at: new Date() })
      .where(eq(platformConfig.key, key));
  }

  const config = await db.select().from(platformConfig);
  return Response.json({ config });
}
