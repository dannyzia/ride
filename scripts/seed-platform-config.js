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
      ('scooter_vehicle_type_enabled',         'false', now())
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log("platform_config seeded (24 keys)");
  await client.end();
}
seed().catch(console.error);
