const postgres = require("postgres");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function runMigration() {
  const sqlPath = path.join(__dirname, "..", "src", "db", "migrations", "0012_nifty_bishop.sql");
  const rawSql = fs.readFileSync(sqlPath, "utf-8");
  // Split on statement-breakpoint and execute each statement
  const statements = rawSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });

  for (const stmt of statements) {
    try {
      await client.unsafe(stmt);
      const preview = stmt.replace(/\n/g, " ").slice(0, 80);
      console.log("OK:", preview + (stmt.length > 80 ? "..." : ""));
    } catch (err) {
      // Skip "already exists" errors (idempotent)
      if (err.message.includes("already exists") || err.message.includes("does not exist")) {
        console.log("SKIP (already applied):", err.message.slice(0, 80));
      } else {
        console.error("FAILED:", err.message);
        console.error("Statement:", stmt.slice(0, 200));
        await client.end();
        process.exit(1);
      }
    }
  }

  console.log("\nMigration complete. Verifying tables...");
  const tables = await client`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('faqs', 'support_tickets', 'user_emergency_contacts', 'driver_schedule')
    ORDER BY tablename;
  `;
  for (const t of tables) {
    console.log("  Table exists:", t.tablename);
  }

  const cols = await client`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name IN ('on_break', 'break_started_at')
    UNION ALL
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deleted_at';
  `;
  for (const c of cols) {
    console.log("  Column exists:", c.column_name);
  }

  await client.end();
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});