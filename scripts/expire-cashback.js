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
  console.log("[scheduler] Expiring cashback credits...");

  const result = await db.execute(`
    WITH expired AS (
      SELECT id, rider_id, amount_bdt
      FROM rider_wallet_transactions
      WHERE transaction_type = 'cashback_earn'
        AND expires_at <= now()
    ),
    updates AS (
      UPDATE users
      SET rider_wallet_balance_bdt = rider_wallet_balance_bdt - expired.amount_bdt
      FROM expired
      WHERE users.id = expired.rider_id
      RETURNING users.id as rider_id, expired.amount_bdt
    )
    INSERT INTO rider_wallet_transactions (
      rider_id, transaction_type, amount_bdt, reference_id,
      balance_after, created_at
    )
    SELECT u.id, 'cashback_expire', -u2.amount_bdt, u2.rider_id,
           u.rider_wallet_balance_bdt, now()
    FROM updates u
    JOIN users u2 ON u.id = u2.id
    RETURNING 1;
  `);

  console.log(`[scheduler] Expired credits: ${result.count || 0} rows`);
  console.log("[scheduler] Done");
  await client.end();
}

run().catch((err) => {
  console.error("[scheduler] Error:", err);
  process.exit(1);
});
