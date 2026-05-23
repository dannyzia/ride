import { db } from '../../../src/db';
import { drivers, pricing, platformConfig } from '../../../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '../../../lib/auth';

export async function GET(req: Request) {
  const decoded = await requireRole('driver')(req);
  if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [driver] = await db.select({ vehicle_type: drivers.vehicle_type })
    .from(drivers).where(eq(drivers.user_id, decoded.user.id)).limit(1);
  if (!driver) return Response.json({ error: 'Driver not found' }, { status: 404 });

  const [pricingRow] = await db.select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(eq(pricing.vehicle_type, driver.vehicle_type), eq(pricing.is_active, true)))
    .limit(1);
  const systemPerKmBdt = pricingRow?.per_km_bdt ?? 0;

  const configRows = await db.select()
    .from(platformConfig)
    .where(inArray(platformConfig.key, ['driver_min_ratio', 'driver_max_ratio']));
  const get = (k: string, def: number) =>
    parseFloat(configRows.find(r => r.key === k)?.value ?? String(def));
  const minRatio = get('driver_min_ratio', 0.70);
  const maxRatio = get('driver_max_ratio', 1.50);

  return Response.json({
    vehicle_type:     driver.vehicle_type,
    system_per_km_bdt: systemPerKmBdt,
    min_ratio:        minRatio,
    max_ratio:        maxRatio,
    lower_bound:      Math.floor(systemPerKmBdt * minRatio),
    upper_bound:      Math.ceil(systemPerKmBdt * maxRatio),
  });
}
