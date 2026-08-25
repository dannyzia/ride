/**
 * Fare framework config seed script.
 *
 * Run via: npx tsx scripts/fare-framework-config.ts [--dry-run]
 *
 * Inserts all fare framework default values into platform_config.
 * Uses ON CONFLICT DO UPDATE — safe to re-run (idempotent).
 */
import { db } from '../src/db';
import { platformConfig } from '../src/db/schema';
import { FARE_FRAMEWORK_DEFAULTS, type FareFrameworkConfigKey } from '../lib/fareFrameworkConfig';
import { logger } from '../lib/logger';

const DRY_RUN = process.argv.includes('--dry-run');

async function seedFareFrameworkConfig(): Promise<void> {
  logger.info('[fare-framework-config] Starting seed');
  logger.info(`[fare-framework-config] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

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
