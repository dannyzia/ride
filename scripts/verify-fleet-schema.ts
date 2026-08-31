/**
 * Phase 1 verification probe (temporary). Run: npx tsx scripts/verify-fleet-schema.ts
 */
import "./_load-env";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  if (process.argv.includes("--enforce-notnull")) {
    await db.execute(sql`ALTER TABLE drivers ALTER COLUMN fleet_id SET NOT NULL`);
    await db.execute(sql`ALTER TABLE vehicles ALTER COLUMN fleet_id SET NOT NULL`);
    console.log("NOT NULL enforced on drivers.fleet_id and vehicles.fleet_id");
  }
  const tables = (await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('fleets','fleet_members','fleet_vehicle_assignments','fleet_subscription_plans','fleet_subscriptions','fleet_billing_transactions','fleet_alerts','audit_logs') ORDER BY 1`,
  )) as unknown as { table_name: string }[];
  console.log("fleet tables:", tables.map((r) => r.table_name).join(", "));

  const idx = (await db.execute(
    sql`SELECT indexname FROM pg_indexes WHERE tablename='vehicles' ORDER BY 1`,
  )) as unknown as { indexname: string }[];
  console.log("vehicles indexes:", idx.map((r) => r.indexname).join(", "));

  const cols = (await db.execute(
    sql`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_name IN ('drivers','vehicles') AND column_name='fleet_id' ORDER BY 1`,
  )) as unknown as { table_name: string; is_nullable: string }[];
  console.log("fleet_id columns:", JSON.stringify(cols));

  process.exit(0);
}
main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
