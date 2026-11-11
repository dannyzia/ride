const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { sql } = require("drizzle-orm");
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
      ('shop_order_cancel_fee_after_accept_bdt', '0',    now()),
      -- S5 (plan 27 §4/F-17/F-19/F-22): fleet + emergency launch economics.
      -- Seeds, never constants — same §12 rule as the keys above.
      -- fleet_owner_share_percent: owner keeps 0% → 100% driver at launch
      --   (owner ruling: default 100% driver unless ruled otherwise).
      -- vehicle_doc_expiry_warning_days: T-days warning before fitness/tax
      --   expiry (the BLOCK at expiry is a date check in dispatch, not this).
      -- emergency_ack_timeout_seconds: F-19's 60s silence → escalate.
      -- emergency_escalation_k_ring: widened H3 ring used by the escalation
      --   re-broadcast (base broadcast ring = emergency_broadcast_k_ring).
      ('fleet_owner_share_percent',            '0',     now()),
      ('vehicle_doc_expiry_warning_days',      '30',    now()),
      ('emergency_ack_timeout_seconds',        '60',    now()),
      ('emergency_escalation_k_ring',          '50',    now()),
      -- S6 (plan 27 §6.1 + §12): sequential delivery dispatch + COD dues.
      -- delivery_offer_window_seconds: 45s per-offer response window (§6.1).
      -- delivery_max_suggestions: 3 candidates max per leg chain (§6.1).
      -- cod_remittance_overdue_days: COD cash due becomes overdue after 7
      --   days (F-33 reminders + dispatch-hold trigger).
      -- cod_dispatch_hold_threshold_bdt: hold a courier from dispatch when
      --   their overdue total exceeds this (0 paisa = any overdue due holds).
      ('delivery_offer_window_seconds',        '45',    now()),
      ('delivery_max_suggestions',             '3',     now()),
      ('cod_remittance_overdue_days',          '7',     now()),
      ('cod_dispatch_hold_threshold_bdt',      '0',     now()),
      -- D9-2 (skeptic §D9): money-movement master switch. Default false —
      -- priced package/topup/pass purchases 409 until month-3 payments
      -- launch. One flag (PATCH /api/admin/config) restores everything.
      ('payments_enabled',                     'false', now()),
      ('women_only_rides_enabled',             'false', now()),
      ('scooter_vehicle_type_enabled',         'false', now()),
      -- dpMaps in-house mapping & routing engine integration
      ('routing_provider_mode',                'shadow', now()),
      ('search_provider_mode',                 'mixed_shadow', now()),
      ('dpmaps_osrm_car_url',                  'http://localhost:5001', now()),
      ('dpmaps_osrm_bike_url',                 'http://localhost:5002', now()),
      ('dpmaps_osrm_cng_url',                  'http://localhost:5003', now()),
      ('dpmaps_meilisearch_url',               'http://localhost:7700', now()),
      ('dpmaps_tiles_style_url',               'https://tiles.yourdomain.com/style.json', now()),
      ('dpmaps_osrm_timeout_ms',               '300', now()),
      ('dpmaps_barikoi_timeout_ms',            '400', now()),
      ('dpmaps_google_spend_cap_usd',          '50.00', now()),
      ('dpmaps_learning_ingest_enabled',       'true', now()),
      -- Node launch (DESIGN-NODE-LAUNCH.md Component A / T1): ride-vertical
      -- visibility flag. Seeded TRUE so dev/staging databases stay
      -- ride-visible through stages 1-5 (fail-closed clients render ride
      -- hidden on any database that missed this seed). Applies to FRESH
      -- databases only — ON CONFLICT DO NOTHING never repairs a flipped
      -- row; flipping (and flipping back) is exclusively
      -- PATCH /api/admin/config (owner-only, BOOLEAN_KEYS).
      ('ride_vertical_enabled',                'true', now()),
      // The Stage-3 activation runbook writes the cutover timestamp at
      // activation time; this script does not seed it.
      ('revenue_model',           'subscription_only', now()),
      ('max_commission_debt_bdt', '50000',             now()),
      // Batch-2 Item 5: per-operator-role debt ceilings (paisa). Defaults
      // mirror the driver ceiling — no invented sizing; admin raises as needed.
      ('max_debt_ceiling_shop_bdt',     '50000', now()),
      ('max_debt_ceiling_delivery_bdt', '50000', now()),
      ('max_debt_ceiling_fleet_bdt',    '50000', now())
    ON CONFLICT (key) DO NOTHING;
  `);

  // M-20: canonical ৳0 Commission package — idempotent, inline SQL because
  // this CJS script cannot import the TS lib. The SQL mirrors
  // lib/monetizationMode.ensureCommissionPackage()'s predicate (and its
  // pg_advisory_xact_lock pattern — race-prone callers guard with
  // hashtext('ensure_commission_package')); packages_code_live_uq is the
  // schema backstop. The helper remains the runtime consumer of record.
  await db.execute(sql`
    INSERT INTO packages (name, code, call_count, duration_days, price_bdt, is_trial, is_active, daily_cap, vehicle_type, roles, product_type, created_at, updated_at)
    SELECT 'Commission', 'commission', 0, NULL, 0, false, true, 0, NULL, '{driver}'::text[], 'commission', now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM packages
      WHERE product_type = 'commission' AND price_bdt = 0 AND is_trial = false
        AND duration_days IS NULL AND deleted_at IS NULL
    );
  `);

  // D1 seed-time assertion, generalized per role (Batch-2 Item 5): EACH
  // role's ceiling must cover the most expensive live call package applicable
  // to that role plus the ৳10 dust buffer.
  const ceilingKeys = [
    { key: 'max_commission_debt_bdt', role: 'driver' },
    { key: 'max_debt_ceiling_shop_bdt', role: 'shop' },
    { key: 'max_debt_ceiling_delivery_bdt', role: 'delivery' },
    { key: 'max_debt_ceiling_fleet_bdt', role: 'fleet' },
  ];
  for (const { key, role } of ceilingKeys) {
    const [ceilingRow] = await db.execute(sql`SELECT value FROM platform_config WHERE key = ${key}`);
    const [maxPriceRow] = await db.execute(sql`
      SELECT COALESCE(MAX(price_bdt), 0) AS max_price
      FROM packages
      WHERE deleted_at IS NULL AND product_type = 'call_package'
        AND applicable_roles @> ARRAY[${role}]::text[]`);
    const ceiling = Number(ceilingRow?.value);
    const maxPrice = Number(maxPriceRow?.max_price);
    if (!Number.isFinite(ceiling) || ceiling < maxPrice + 1000) {
      throw new Error(
        `D1 floor violated: ${key} ${ceiling} < max live ${role}-applicable call-package price ${maxPrice} + 1,000 paisa`,
      );
    }
  }

  console.log("platform_config seeded (41 keys)");
  await client.end();
}
seed().catch(console.error);
