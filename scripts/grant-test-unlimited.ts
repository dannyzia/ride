/**
 * Grant the test driver an "unlimited" call package + active subscription, free,
 * with no daily cap. Re-runnable (ON CONFLICT DO UPDATE). Use this before any
 * Segment 1 run so the dispatch pool filter (calls_remaining > 0, daily cap
 * not exceeded) never blocks the test.
 *
 *   npx tsx scripts/grant-test-unlimited.ts
 *   CALLS=999999 DAYS=36500 npx tsx scripts/grant-test-unlimited.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

// Load utils-server/.env.
const envPath = resolve(__dirname, "..", "utils-server", ".env");
for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing in utils-server/.env");
  process.exit(1);
}

const CALLS = Number(process.env.CALLS ?? 999_999);
const DAYS = Number(process.env.DAYS ?? 36500); // ~100 years
const PACKAGE_NAME = "Test Unlimited";
const DRIVER_PHONE = "+8801700000001";

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

(async () => {
  try {
    const driverRows = await sql<{ id: string }[]>`
      SELECT d.id FROM drivers d JOIN users u ON u.id = d.user_id
      WHERE u.phone = ${DRIVER_PHONE} LIMIT 1
    `;
    if (driverRows.length === 0) {
      console.error(`[grant] no driver for ${DRIVER_PHONE}`);
      process.exit(2);
    }
    const driverId = driverRows[0].id;
    console.log(`[grant] driver ${DRIVER_PHONE} -> ${driverId}`);

    // Upsert the Test Unlimited package (no unique constraint on name; check-then-act).
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM packages WHERE name = ${PACKAGE_NAME} AND deleted_at IS NULL LIMIT 1
    `;
    let packageId: string;
    if (existing.length > 0) {
      packageId = existing[0].id;
      await sql`
        UPDATE packages
        SET call_count = ${CALLS}, duration_days = ${DAYS}, price_bdt = 0,
            is_active = true, daily_cap = ${CALLS}, deleted_at = NULL, updated_at = NOW()
        WHERE id = ${packageId}
      `;
    } else {
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO packages (name, call_count, duration_days, price_bdt, is_trial, is_active, daily_cap, vehicle_type)
        VALUES (${PACKAGE_NAME}, ${CALLS}, ${DAYS}, 0, false, true, ${CALLS}, NULL)
        RETURNING id
      `;
      packageId = inserted[0].id;
    }
    console.log(`[grant] package "${PACKAGE_NAME}" -> ${packageId}  (calls=${CALLS}, days=${DAYS}, price=0, daily_cap=${CALLS})`);

    // Update-or-insert the active subscription in place (FK from
    // driver_online_sessions.subscription_id blocks DELETE).
    const now = new Date();
    const expires = new Date(now.getTime() + DAYS * 86400 * 1000);
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const existingSub = await sql<{ id: string }[]>`
      SELECT id FROM subscriptions WHERE driver_id = ${driverId} AND status = 'active' LIMIT 1
    `;
    if (existingSub.length > 0) {
      await sql`
        UPDATE subscriptions
        SET package_id = ${packageId}, calls_remaining = ${CALLS},
            daily_calls_used = 0, daily_reset_at = ${tomorrow.toISOString()}::timestamptz,
            cap_override = NULL, status = 'active',
            purchased_at = ${now.toISOString()}::timestamptz,
            expires_at = ${expires.toISOString()}::timestamptz,
            credit_calls_received = 0, total_deductions = 0, is_trial = false,
            updated_at = NOW()
        WHERE id = ${existingSub[0].id}
      `;
      console.log(`[grant] subscription UPDATED: ${existingSub[0].id}  calls_remaining=${CALLS} expires=${expires.toISOString()}`);
    } else {
      await sql`
        INSERT INTO subscriptions (
          driver_id, package_id, calls_remaining, daily_calls_used, daily_reset_at,
          cap_override, status, purchased_at, expires_at,
          credit_calls_received, total_deductions, is_trial
        ) VALUES (
          ${driverId}, ${packageId}, ${CALLS}, 0, ${tomorrow.toISOString()}::timestamptz,
          NULL, 'active', ${now.toISOString()}::timestamptz, ${expires.toISOString()}::timestamptz,
          0, 0, false
        )
      `;
      console.log(`[grant] subscription CREATED: driver=${driverId} package=${packageId} calls_remaining=${CALLS} expires=${expires.toISOString()}`);
    }
    console.log(`[grant] DONE. Driver is ready for ride testing.`);
  } catch (e) {
    console.error("[grant] FAILED:", e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
})();
