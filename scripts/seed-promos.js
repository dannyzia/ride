/**
 * Seed promo codes + rider intro configs for testing the Promos & Vouchers
 * section in the FARES panel.
 *
 * Usage: node scripts/seed-promos.js
 *
 * What gets seeded:
 *   1. Promo codes — active, valid for 1 year, riders can redeem via
 *      POST /api/promo/redeem { code, vehicle_type, pickup_lat, pickup_lng }
 *   2. Rider intro configs — auto-apply discounts for first N rides per zone.
 *      Requires at least one zone row in the DB.
 */

const postgres = require("postgres");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });

  // ── 1. Promo Codes ──────────────────────────────────────────────
  // All active, valid for 1 year from now, generous limits for testing.
  const promoRows = [
    {
      code: "WELCOME50",
      title: "50% off your first ride",
      description: "Welcome to Ride — enjoy 50% off",
      discount_type: "percent",
      discount_value: 50,
      max_discount_bdt: 25000, // 250 BDT max in paisa
      min_spend_bdt: 1000, // 10 BDT minimum
      max_uses: 10000,
      max_uses_per_rider: 1,
      validity_days: 30,
    },
    {
      code: "SAVE100",
      title: "Flat ৳100 off",
      description: "Flat ৳100 off your next ride",
      discount_type: "flat",
      discount_value: 10000, // 100 BDT in paisa
      max_discount_bdt: 10000,
      min_spend_bdt: 5000, // 50 BDT minimum
      max_uses: 5000,
      max_uses_per_rider: 2,
      validity_days: 14,
    },
    {
      code: "BIKE20",
      title: "20% off bike rides",
      description: "20% off any bike ride",
      discount_type: "percent",
      discount_value: 20,
      max_discount_bdt: 15000, // 150 BDT max
      min_spend_bdt: 500,
      max_uses: 3000,
      max_uses_per_rider: 3,
      validity_days: 30,
    },
    {
      code: "RAIN30",
      title: "30% monsoon special",
      description: "Stay dry — 30% off during rain",
      discount_type: "percent",
      discount_value: 30,
      max_discount_bdt: 20000, // 200 BDT max
      min_spend_bdt: 1000,
      max_uses: 2000,
      max_uses_per_rider: 2,
      validity_days: 60,
    },
  ];

  // Build a single multi-row INSERT with ON CONFLICT DO NOTHING
  const promoValues = promoRows
    .map(
      (p) =>
        `(${sqlStr(p.code)}, ${sqlStr(p.title)}, ${sqlStr(p.description)}, ` +
        `${sqlStr(p.discount_type)}, ${p.discount_value}, ` +
        `${p.max_discount_bdt}, ${p.min_spend_bdt}, ` +
        `${p.max_uses}, ${p.max_uses_per_rider}, ` +
        `${p.validity_days})`,
    )
    .join(",\n      ");

  await client.unsafe(`
    INSERT INTO promo_codes (
      code, title, description,
      discount_type, discount_value,
      max_discount_bdt, min_spend_bdt,
      max_uses, max_uses_per_rider,
      validity_days,
      valid_from, expires_at,
      is_active, target_role, created_at, updated_at
    )
    SELECT
      v.code, v.title, v.description,
      v.discount_type::discount_type, v.discount_value,
      v.max_discount_bdt, v.min_spend_bdt,
      v.max_uses, v.max_uses_per_rider,
      v.validity_days,
      now(), now() + (v.validity_days || ' days')::interval,
      true, 'rider', now(), now()
    FROM (VALUES
      ${promoValues}
    ) AS v(code, title, description, discount_type, discount_value,
           max_discount_bdt, min_spend_bdt,
           max_uses, max_uses_per_rider, validity_days)
    WHERE NOT EXISTS (
      SELECT 1 FROM promo_codes pc WHERE LOWER(pc.code) = LOWER(v.code)
    );
  `);
  console.log(`promo_codes seeded (${promoRows.length} codes)`);

  // ── 2. Rider Intro Configs ──────────────────────────────────────
  // Auto-applies discounts for the rider's first N rides.
  // Requires at least one zone in the zones table.
  const zoneResult = await client.unsafe(`SELECT id FROM zones WHERE is_active = true LIMIT 1`);
  if (zoneResult.length === 0) {
    console.log("⚠ No active zones found — skipping rider_intro_configs seed");
    console.log("  Run seed-city-boundaries.js first, then re-run this script");
  } else {
    const zoneId = zoneResult[0].id;

    // Intro discounts: 50% off rides 1-2, 30% off ride 3, 20% off rides 4-5
    const introRows = [
      { ride_number: 1, discount_percent: 50, max_discount_bdt: 30000, daily_cap_bdt: 10000 },
      { ride_number: 2, discount_percent: 50, max_discount_bdt: 25000, daily_cap_bdt: 10000 },
      { ride_number: 3, discount_percent: 30, max_discount_bdt: 20000, daily_cap_bdt: 8000 },
      { ride_number: 4, discount_percent: 20, max_discount_bdt: 15000, daily_cap_bdt: 5000 },
      { ride_number: 5, discount_percent: 20, max_discount_bdt: 15000, daily_cap_bdt: 5000 },
    ];

    for (const row of introRows) {
      await client.unsafe(`
        INSERT INTO rider_intro_configs (
          zone_id, is_active, ride_number, discount_percent,
          max_discount_bdt, daily_cap_bdt,
          created_at, updated_at
        )
        SELECT
          $1, true, $2, $3,
          $4, $5,
          now(), now()
        WHERE NOT EXISTS (
          SELECT 1 FROM rider_intro_configs ric
          WHERE ric.zone_id = $1 AND ric.ride_number = $2
        );
      `, [zoneId, row.ride_number, row.discount_percent, row.max_discount_bdt, row.daily_cap_bdt]);
    }
    console.log(`rider_intro_configs seeded (${introRows.length} rows for zone ${zoneId.slice(0, 8)}…)`);
  }

  console.log("\nDone. Riders will see:");
  console.log("  • Intro discounts auto-applied for rides 1–5");
  console.log("  • Promo codes: WELCOME50, SAVE100, BIKE20, RAIN30");
  console.log("    (rider enters code via /api/promo/redeem → shows in FARES panel)");

  await client.end();
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
