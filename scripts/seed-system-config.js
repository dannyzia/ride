const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });
  const db = drizzle(client);
  await db.execute(`
    INSERT INTO system_config (key, value, updated_at) VALUES
      ('dispatch_paused',        'false',  now()),
      ('min_app_version',        '1.0.0',  now()),
      ('brta_fare_ceiling_bdt',  '50000',  now()),
      ('sos_contacts',           '[{"label":"National Emergency","number":"999"}]', now()),
      ('max_free_wait_seconds',  '60', now()),
      ('cashback_percent',       '5', now()),
      ('cashback_monthly_cap_bdt', '50000', now()),
      ('cashback_expiry_days',   '90', now()),
      ('wallet_redemption_max_percent', '50', now())
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log("system_config seeded");
  await client.end();
}
seed().catch(console.error);
