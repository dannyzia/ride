/**
 * C6-3: shop-member re-invite after offboarding.
 *
 * DELETE /api/shop/[id]/members soft-removes (removed_at); the old FULL
 * unique index on (shop_id, user_id) then 23505'd any re-invite into the
 * route's 409 already_member — permanently. The fix is purely the
 * constraint: partial uniqueness over live rows. This suite pins all three
 * halves (schema declaration, migration DDL, journal entry) so a revert of
 * any one fails loudly. It asserts file content, not behavior: with a
 * mocked db no unit test can exercise a Postgres index.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("C6-3 shop_members live-uniqueness", () => {
  it("schema declares the partial unique index over removed_at IS NULL", () => {
    const schema = read("src/db/schema.ts");
    const anchor = schema.indexOf('uniqueIndex("shop_members_unique_idx")');
    expect(anchor).toBeGreaterThan(-1);
    // The .where() must sit on THIS index declaration (same statement —
    // bounded window, not a whole-file grep that a second partial index
    // elsewhere could satisfy).
    const stmt = schema.slice(anchor, anchor + 220);
    expect(stmt).toContain(".where(");
    expect(stmt).toContain("removed_at");
    expect(stmt).toContain("IS NULL");
  });

  it("migration 0079 swaps the full index for the partial one, loudly on live dupes", () => {
    const sql = read("src/db/migrations/0079_shop_members_reinvite_partial.sql");
    expect(sql).toContain("DROP INDEX IF EXISTS shop_members_unique_idx");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS shop_members_unique_idx");
    expect(sql).toContain("WHERE removed_at IS NULL");
    // Live duplicates are impossible under the old full index — if they ever
    // appear the migration must fail rather than silently pick winners.
    expect(sql).toContain("RAISE EXCEPTION");
  });

  it("the journal registers 0079 after 0078", () => {
    const journal = read("src/db/migrations/meta/_journal.json");
    const entries = JSON.parse(journal).entries as { idx: number; tag: string }[];
    const tags = entries.map((e) => e.tag);
    expect(tags).toContain("0079_shop_members_reinvite_partial");
    expect(tags.indexOf("0079_shop_members_reinvite_partial")).toBeGreaterThan(
      tags.indexOf("0078_ride_cash_handshake"),
    );
  });
});
