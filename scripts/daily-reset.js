const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
require("dotenv").config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 5,
  idle_timeout: 30,
  connect_timeout: 30,
});

const db = drizzle(client);

async function run() {
  console.log("[scheduler] Starting daily reset...");

  await db.execute(`
    UPDATE zone_budgets
    SET spent_today_bdt = 0,
        is_paused = false,
        reset_at = now(),
        updated_at = now()
    WHERE reset_at < now();
  `);

  console.log("[scheduler] Daily reset complete");

  await db.execute(`
    INSERT INTO zone_budget_logs (
      zone_budget_id, zone_id, amount_bdt, balance_before_bdt,
      balance_after_bdt, event, reason, created_at
    )
    SELECT id, zone_id, 0, spent_today_bdt, 0, 'reset', 'daily_reset', now()
    FROM zone_budgets
    WHERE spent_today_bdt = 0 AND reset_at = now();
  `);

  console.log("[scheduler] Reset log entries complete");

  const { evaluateGraduation } = require("./lib/zoneLifecycle");
  if (typeof evaluateGraduation === "function") {
    await evaluateGraduation();
  } else {
    await db.execute(`
      DO $$
      DECLARE
        z RECORD;
      BEGIN
        FOR z IN
          SELECT id, lifecycle_stage FROM zones WHERE is_active = true
        LOOP
          RAISE NOTICE 'Zone %: stage=%', z.id, z.lifecycle_stage;
        END LOOP;
      END $$;
    `);
    console.log("[scheduler] Graduation evaluation complete");
  }

  console.log("[scheduler] All jobs done");
  await client.end();
}

run().catch((err) => {
  console.error("[scheduler] Error:", err);
  process.exit(1);
});
