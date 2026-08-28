/**
 * Seed fuel engine config keys into platform_config.
 *
 * Inserts the 29 keys needed by the Fare Engine Setup section
 * (fare-config.tsx). Uses ON CONFLICT DO NOTHING so re-running is safe.
 *
 * Values match lib/tierRateDerivation.ts defaults and lib/fuelConfig.ts
 * fallback values. All money values are in BDT (not paisa) — the UI
 * converts to paisa via ×100 before passing to tierRateDerivation.
 *
 * Usage: node scripts/seed-fuel-config.js
 */
const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

const KEYS = [
  // ── Global fuel prices (BDT per litre or m³) ──
  ['fuel_price_petrol_bdt',    '140'],   // 140 BDT/L petrol (REV-4)
  ['fuel_price_octane_bdt',    '145'],   // 145 BDT/L octane (REV-4)
  ['fuel_price_cng_bdt',       '43'],    // 43 BDT/m³ CNG

  // ── Per-tier fuel efficiency (km/L or km/m³) ──
  ['fuel_efficiency_bike_basic',    '45'],
  ['fuel_efficiency_bike_standard', '40'],
  ['fuel_efficiency_bike_plus',     '33'],
  ['fuel_efficiency_cng',           '20'],
  ['fuel_efficiency_car_compact',   '12'],
  ['fuel_efficiency_car_economy',   '10'],
  ['fuel_efficiency_car_comfort',   '8'],
  ['fuel_efficiency_car_premium',   '10'],
  ['fuel_efficiency_car_xl',        '13'],

  // ── Driver maintenance per km (paisa, canonical from fareFrameworkConfig.ts) ──
  ['driver_maint_per_km_bike', '55'],    // 55 paisa/km = 0.55 taka
  ['driver_maint_per_km_cng',  '105'],   // 105 paisa/km = 1.05 taka
  ['driver_maint_per_km_car',  '345'],   // 345 paisa/km = 3.45 taka

  // ── Daily target per tier (paisa, canonical from fareFrameworkConfig.ts) ──
  ['daily_target_bdt_bike', '110000'],   // 110000 paisa = 1100 taka/day
  ['daily_target_bdt_cng',  '120000'],   // 120000 paisa = 1200 taka/day
  ['daily_target_bdt_car',  '125000'],   // 125000 paisa = 1250 taka/day

  // ── Expected billed minutes per tier ──
  ['expected_billed_minutes_bike', '240'],
  ['expected_billed_minutes_cng',  '220'],
  ['expected_billed_minutes_car',  '200'],

  // ── Joma recovery (BDT) ──
  ['joma_bike_eco_monthly_bdt',  '8000'],   // bike_basic
  ['joma_bike_std_monthly_bdt',  '10000'],  // bike_standard
  ['joma_bike_prem_monthly_bdt', '12000'],  // bike_plus
  ['joma_daily_bdt_cng',         '800'],    // CNG (BDT/day)

  // ── Shared ──
  ['joma_operating_days_per_month', '26'],
];

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set. Run from project root with .env.local.');
    process.exit(1);
  }
  const client = postgres(url, { ssl: 'require' });

  // Insert in batches of 10 to avoid statement timeout on Supabase pooler.
  const BATCH_SIZE = 10;
  let inserted = 0;
  for (let i = 0; i < KEYS.length; i += BATCH_SIZE) {
    const batch = KEYS.slice(i, i + BATCH_SIZE);
    const rows = batch.map(
      ([k, v]) => `('${k}', '${v}', now())`,
    ).join(',\n      ');
    await client.unsafe(`
      INSERT INTO platform_config (key, value, updated_at)
      VALUES
        ${rows}
      ON CONFLICT (key) DO NOTHING;
    `);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${KEYS.length} keys...\r`);
  }

  console.log(`\nSeeded ${KEYS.length} fuel config keys into platform_config (ON CONFLICT DO NOTHING).`);
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
