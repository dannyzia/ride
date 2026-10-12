// Generic applier for hand-authored migrations in src/db/migrations/0048+ style.
// Usage: node scripts/apply-migration.js src/db/migrations/0058_....sql
//
// Splits on `--> statement-breakpoint` and executes each statement SEPARATELY
// (autocommit) so ALTER TYPE ... ADD VALUE never shares a transaction block
// with anything that uses the new value (D5 rule).
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });
const postgres = require("postgres");

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/apply-migration.js <file.sql>");
    process.exit(1);
  }
  const sqlText = fs.readFileSync(path.resolve(file), "utf8");
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });
  for (let i = 0; i < statements.length; i++) {
    await client.unsafe(statements[i]);
    console.log(`[${i + 1}/${statements.length}] ok`);
  }
  await client.end();
  console.log(`applied ${file}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
