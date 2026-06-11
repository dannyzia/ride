/**
 * Seed script for Ride database.
 *
 * Usage: npx tsx --env-file=.env.local src/db/seed.ts
 *
 * Idempotent — safe to run multiple times.
 */

import { db } from './index';
import { systemConfig } from './schema';
import { eq } from 'drizzle-orm';

async function seedSystemConfig() {
  // maps_provider toggle (default: 'barikoi', admin can switch to 'google')
  const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, 'maps_provider')).limit(1);
  if (!existing.length) {
    await db.insert(systemConfig).values({ key: 'maps_provider', value: 'barikoi' });
    console.log('[seed] system_config: maps_provider = barikoi');
  } else {
    console.log('[seed] system_config: maps_provider already set =', existing[0].value);
  }
}

async function main() {
  console.log('[seed] Starting...');
  await seedSystemConfig();
  console.log('[seed] Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
