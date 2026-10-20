/**
 * S8 pricing-seed pin (§6.5.8): migration 0087 seeds scooter pricing with an
 * INSERT..SELECT that clones live bike_basic rows — it must contain zero
 * literal paisa numbers (seeds, not constants). A future edit that hard-codes
 * a fare literal into the clone fails this suite.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
  join(__dirname, "..", "..", "src", "db", "migrations", "0087_gender_women_only.sql"),
  "utf8",
);

describe("migration 0087 — scooter pricing clone carries zero paisa literals", () => {
  test("INSERT..SELECT clones bike_basic columns without paisa literals", () => {
    const insertBlock = SQL.slice(SQL.indexOf("INSERT INTO pricing"));
    expect(insertBlock).toContain("FROM pricing p");
    expect(insertBlock).toContain("vehicle_type = 'bike_basic'");
    // The NOT EXISTS idempotency guard's `SELECT 1` is a SQL existence
    // idiom, not money — strip it, then assert no numeric literal remains
    // in the pricing clone: every selected value is a column ref.
    const stripped = insertBlock.replace(/SELECT 1 FROM/g, "SELECT x FROM");
    const numericLiterals = stripped.match(/\b\d[\d_]*(?:\.\d+)?\b/g) ?? [];
    expect(numericLiterals).toEqual([]);
  });

  test("scooter row guarded by NOT EXISTS (idempotent per zone)", () => {
    expect(SQL).toContain("p2.vehicle_type = 'scooter'");
    expect(SQL).toContain("ON CONFLICT (key) DO NOTHING");
  });
});
