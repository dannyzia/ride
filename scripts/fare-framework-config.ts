/**
 * Fare framework config seed script.
 *
 * Run via: npx tsx scripts/fare-framework-config.ts [--dry-run]
 *
 * Inserts all fare framework default values into platform_config.
 * Uses ON CONFLICT DO UPDATE — safe to re-run (idempotent).
 *
 * REV-4: re-running applies the current REV-4 defaults via ON CONFLICT DO UPDATE
 * (free radius 1.0/1.5/2.0 km, free pickup time 5/5/10 min, petrol 140 BDT,
 * bike joma three-tier keys, new-driver priority N=10). The three stale
 * parking_per_km_* keys are actively DELETED if still present.
 */
import { db } from '../src/db';
import { platformConfig } from '../src/db/schema';
import { inArray } from 'drizzle-orm';
import { FARE_FRAMEWORK_DEFAULTS, type FareFrameworkConfigKey } from '../lib/fareFrameworkConfig';
import { logger } from '../lib/logger';

const DRY_RUN = process.argv.includes('--dry-run');

// REV-4: parking keys are removed from FARE_FRAMEWORK_DEFAULTS (parking is
// owner-borne, recovered inside joma). Any rows still in platform_config are
// stale and must be deleted so they never leak back into config reads.
const STALE_PARKING_KEYS = [
  'parking_per_km_bike',
  'parking_per_km_cng',
  'parking_per_km_car',
] as const;

async function seedFareFrameworkConfig(): Promise<void> {
  logger.info('[fare-framework-config] Starting seed');
  logger.info(`[fare-framework-config] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  // REV-4 cleanup: plain DELETE WHERE key IN (...) — no upsert for stale keys.
  if (DRY_RUN) {
    logger.info(
      `[fare-framework-config] [dry-run] would delete stale parking keys: ${STALE_PARKING_KEYS.join(', ')}`,
    );
  } else {
    try {
      const deleted = await db
        .delete(platformConfig)
        .where(inArray(platformConfig.key, [...STALE_PARKING_KEYS]))
        .returning({ key: platformConfig.key });
      if (deleted.length > 0) {
        logger.info(
          `[fare-framework-config] Deleted ${deleted.length} stale parking key rows (REV-4): ${deleted
            .map((d) => d.key)
            .join(', ')}`,
        );
      } else {
        logger.info('[fare-framework-config] No stale parking keys found (already clean)');
      }
    } catch (err: unknown) {
      logger.error('[fare-framework-config] Failed to delete stale parking keys', err);
    }
  }

  const entries = Object.entries(FARE_FRAMEWORK_DEFAULTS) as [FareFrameworkConfigKey, string][];
  logger.info(`[fare-framework-config] Seeding ${entries.length} keys`);

  let seeded = 0;
  let skipped = 0;

  for (const [key, value] of entries) {
    if (DRY_RUN) {
      logger.info(`[fare-framework-config] [dry-run] upsert ${key} = ${value}`);
      seeded++;
      continue;
    }

    try {
      await db
        .insert(platformConfig)
        .values({ key, value })
        .onConflictDoUpdate({
          target: platformConfig.key,
          set: { value, updated_at: new Date() },
        });
      seeded++;
    } catch (err: unknown) {
      logger.error(`[fare-framework-config] Failed to seed ${key}`, err);
      skipped++;
    }
  }

  logger.info(`[fare-framework-config] Done. Seeded: ${seeded}, Skipped: ${skipped}`);
}

seedFareFrameworkConfig().catch((e) => {
  logger.error('[fare-framework-config] Fatal error', e);
  process.exit(1);
});
