/**
 * D (P2P origination): parcel legs carry sender-entered handover data on
 * the universal `deliveries` row — no parent row, no parallel table.
 * Pins the storage half: schema columns, migration DDL, journal order.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("P2P parcel handover storage", () => {
  it("schema declares item_note + receiver_phone on deliveries", () => {
    const schema = read("src/db/schema.ts");
    expect(schema).toContain('item_note: text("item_note")');
    expect(schema).toContain('receiver_phone: varchar("receiver_phone", { length: 20 })');
  });

  it("migration 0080 adds both columns (additive, nullable, re-runnable)", () => {
    const sql = read("src/db/migrations/0080_parcel_handover_fields.sql");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "item_note" text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "receiver_phone" varchar(20)');
  });

  it("the journal registers 0080 after 0079", () => {
    const journal = read("src/db/migrations/meta/_journal.json");
    const entries = JSON.parse(journal).entries as { idx: number; tag: string }[];
    const tags = entries.map((e) => e.tag);
    expect(tags).toContain("0080_parcel_handover_fields");
    expect(tags.indexOf("0080_parcel_handover_fields")).toBeGreaterThan(
      tags.indexOf("0079_shop_members_reinvite_partial"),
    );
  });
});
