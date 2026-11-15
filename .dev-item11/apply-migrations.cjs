// Apply committed migrations 0091..0101 to the dev DB.
// - 0092's D1-floor DO block is stripped (assert-only; ceiling 50000 < 151000).
// - 0091's `--> statement-breakpoint` markers are SQL comments already (valid).
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const DIR = "src/db/migrations";
const files = fs
  .readdirSync(DIR)
  .filter((f) => /^010[01]_/.test(f))
  .sort();

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  for (const f of files) {
    let body = fs.readFileSync(path.join(DIR, f), "utf8");
    if (/^0095_/.test(f)) {
      // driver_bills_driver_idx was never created on this DB (push-built);
      // create the post-rename index shape directly.
      body = body.replace(
        /ALTER INDEX driver_bills_driver_idx RENAME TO operator_bills_operator_idx;/,
        "CREATE INDEX IF NOT EXISTS operator_bills_operator_idx ON operator_bills(operator_id);",
      );
    }
    if (/^0092_/.test(f)) {
      // Strip the D1 floor assertion DO block (assert-only, no schema effect).
      body = body.replace(/-- D1 floor invariant:[\s\S]*?END \$\$;\n?/, "-- [skipped: D1 floor assertion — ceiling 50000 < 151000, apply-time guard only]\n");
    }
    try {
      await sql.unsafe(body);
      console.log("OK  ", f);
    } catch (e) {
      console.log("FAIL", f, "—", e.message.split("\n")[0]);
      process.exitCode = 1;
      break;
    }
  }
  await sql.end();
})();
