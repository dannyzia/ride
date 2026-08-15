/**
 * Seed script for Ride database.
 *
 * Usage: npx tsx --env-file=.env.local src/db/seed.ts
 *
 * Idempotent — safe to run multiple times.
 */

import { db } from './index';
import { systemConfig } from './schema';
import { logger } from '../../lib/logger';
import { eq } from 'drizzle-orm';

async function seedSystemConfig() {
  // maps_provider toggle (default: 'barikoi', admin can switch to 'google')
  const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, 'maps_provider')).limit(1);
  if (!existing.length) {
    await db.insert(systemConfig).values({ key: 'maps_provider', value: 'barikoi' });
    logger.info('[seed] system_config: maps_provider = barikoi');
  } else {
    logger.info('[seed] system_config: maps_provider already set =', existing[0].value);
  }

  // dispatch_scoring_weights — all five keys must be present and sum to 1.0.
  // Admin can update this row in the admin panel; utils-server reloads it every 30s.
  const weightsKey = 'dispatch_scoring_weights';
  const defaultWeights = JSON.stringify({
    distance:   0.45,
    rating:     0.20,
    acceptance: 0.20,
    balance:    0.10,
    online:     0.05,
  });
  const weightsExisting = await db.select().from(systemConfig).where(eq(systemConfig.key, weightsKey)).limit(1);
  if (!weightsExisting.length) {
    await db.insert(systemConfig).values({ key: weightsKey, value: defaultWeights });
    logger.info('[seed] system_config: dispatch_scoring_weights seeded with defaults');
  } else {
    logger.info('[seed] system_config: dispatch_scoring_weights already set');
  }

  // eta_speed_kmh — time-of-day speed table for ETA estimation.
  const speedKey = 'eta_speed_kmh';
  const defaultSpeedTable = JSON.stringify({
    bike_: { peak: 15, offpeak: 22, night: 28 },
    cng:   { peak: 12, offpeak: 18, night: 22 },
    car_:  { peak: 10, offpeak: 16, night: 20 },
  });
  const speedExisting = await db.select().from(systemConfig).where(eq(systemConfig.key, speedKey)).limit(1);
  if (!speedExisting.length) {
    await db.insert(systemConfig).values({ key: speedKey, value: defaultSpeedTable });
    logger.info('[seed] system_config: eta_speed_kmh seeded with defaults');
  } else {
    logger.info('[seed] system_config: eta_speed_kmh already set');
  }
}

async function main() {
  logger.info('[seed] Starting...');
  await seedSystemConfig();
  logger.info('[seed] Done.');
  process.exit(0);
}

main().catch((err) => {
  logger.error('[seed] Error:', err);
  process.exit(1);
});
