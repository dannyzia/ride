const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });
  const db = drizzle(client);
  await db.execute(`
    INSERT INTO platform_config (key, value, updated_at) VALUES
      ('driver_min_ratio',           '0.70',  now()),
      ('driver_max_ratio',           '1.50',  now()),
      ('brta_max_base_bdt',          '8500',  now()),
      ('brta_max_per_km_bdt',        '3400',  now()),
      ('brta_max_wait_per_2min_bdt', '850',   now()),
      ('zone_multi_active_enabled',  'false', now()),
      -- Launch surfaces (Amendment 3 D4) + Plan-27 §12 economics
      -- (OWNER-DECISION 2026-10-12, refined): these are SEEDS, never code
      -- constants — every consumer fresh-reads them from platform_config at
      -- request time. Commission is a percent (0-100); fees are integer
      -- paisa. Admin tunes every key via PATCH /api/admin/config.
      -- delivery_fee_default_bdt was DROPPED (§12): superseded by the
      -- distance-tiered fees below; it had no consumer on disk.
      ('delivery_commission_percent',           '0',     now()),
      ('delivery_fee_within_3km_bdt',           '8000',  now()),
      ('delivery_fee_beyond_3km_bdt',           '12000', now()),
      ('delivery_fee_tier_radius_km',           '3',     now()),
      ('delivery_man_subscription_bdt_monthly', '10000', now()),
      ('shop_commission_percent',               '0',     now()),
      -- S4 (§5, F-11): state-dependent customer cancel fee — free before the
      -- shop accepts; after accept this key applies (launch seed 0, admin
      -- raises it via PATCH /api/admin/config). Fresh-read by
      -- lib/shopOrderCancel.ts, never a code constant.
      ('shop_order_cancel_fee_after_accept_bdt', '0',    now())
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log("platform_config seeded (13 keys)");
  await client.end();
}
seed().catch(console.error);
