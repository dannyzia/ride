/**
 * Seed system_config keys for the Operational Toggles section
 * (platform-config.tsx OP_FIELDS + POLICY5_FIELDS).
 *
 * Uses ON CONFLICT DO NOTHING so re-running is safe.
 * Values are sensible defaults for a new deployment.
 *
 * Usage: node scripts/seed-system-config-toggles.js
 */
const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

const KEYS = [
  // ── SOS ──
  ['sos_police_number',              '999'],          // Bangladesh police emergency
  ['sos_ride_number',                '01700000000'],  // Placeholder — set to real support number

  // ── Face match ──
  ['face_match_min_score',           '70'],           // 0–100 similarity threshold

  // ── App versioning ──
  ['latest_version',                 '1.0.0'],
  ['apk_download_url',               ''],             // Empty until APK is hosted

  // ── Geofence & stale timeout ──
  ['stale_arrived_timeout_minutes',  '15'],           // Auto-cancel from 'arrived' after 15 min
  ['geofence_arrival_radius_meters', '50'],           // 50m radius for arrival detection
  ['geofence_arrival_dwell_seconds', '10'],           // 10s dwell to confirm arrival

  // ── Zone multi-active toggle ──
  ['zone_multi_active_enabled',      'false'],

  // ── Plan-05 operational bounds (POLICY5_FIELDS) ──
  ['sos_cooldown_seconds',           '300'],          // 5 min between SOS alerts
  ['sos_auto_resolve_seconds',       '3600'],         // 1 hour auto-resolve
  ['schedule_min_lead_minutes',      '15'],           // Min 15 min advance booking
  ['schedule_max_lead_days',         '7'],            // Max 7 days ahead
  ['cancel_grace_period_seconds',    '60'],           // 60s free cancellation window
];

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set. Run from project root with .env.local.');
    process.exit(1);
  }
  const client = postgres(url, { ssl: 'require' });

  // Insert in batches of 10 to avoid statement timeout.
  const BATCH_SIZE = 10;
  let inserted = 0;
  for (let i = 0; i < KEYS.length; i += BATCH_SIZE) {
    const batch = KEYS.slice(i, i + BATCH_SIZE);
    const rows = batch.map(
      ([k, v]) => `('${k}', '${v.replace(/'/g, "''")}')`,
    ).join(',\n      ');
    await client.unsafe(`
      INSERT INTO system_config (key, value)
      VALUES
        ${rows}
      ON CONFLICT (key) DO NOTHING;
    `);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${KEYS.length} keys...\r`);
  }

  console.log(`\nSeeded ${KEYS.length} system_config keys (ON CONFLICT DO NOTHING).`);
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
