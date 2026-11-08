/**
 * Batch-2 Item 8 — shop usage accrual wiring.
 *
 * The delivered-transition writer (lib/shopLedger.settleShopOrder) is the ONLY
 * hook: it accrues a per-order platform-fee bill through the operator_bills
 * single writer (lib/billsLedger.openUsageBill), inside its own transaction,
 * only when the fresh-read commission is positive — so at the launch default of
 * 0% the owed figure is unchanged.
 *
 * Also pins that accrued usage bills are NOT accidentally payable: Item 7's
 * settlement resolves subscription_purchase bills only.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SHOP_LEDGER = "lib/shopLedger.ts";
const BILLS_LEDGER = "lib/billsLedger.ts";

describe("shop usage accrual (Batch-2 Item 8)", () => {
  test("the hook is single-writer: shopLedger never inserts operator_bills itself", () => {
    const src = read(SHOP_LEDGER);
    expect(src).toContain("openUsageBill");
    expect(src).not.toContain("insert(operatorBills)");
    expect(src).not.toContain("operatorBills");
  });

  test("the accrual lives inside the positive-commission branch (0% writes nothing)", () => {
    const src = read(SHOP_LEDGER);
    const commissionBranch = src.indexOf("if (commissionBdt > 0) {");
    const accrual = src.indexOf("openUsageBill(tx");
    expect(commissionBranch).toBeGreaterThan(-1);
    expect(accrual).toBeGreaterThan(commissionBranch);
    // Same amount as the ledger debit — the fee is the commission, not the fee snapshot.
    expect(src).toContain("amountBdt: commissionBdt");
    // Keyed by the producing order for retry idempotence.
    expect(src).toContain("sourceOrderId: order.id");
  });

  test("openUsageBill writes kind='usage' with the source key and no subscription link", () => {
    const src = read(BILLS_LEDGER);
    expect(src).toContain("kind: 'usage'");
    expect(src).toContain("source_order_id: params.sourceOrderId");
    expect(src).toContain("subscription_id: null");
    expect(src).toContain("onConflictDoNothing()");
    expect(src).toContain("positive integer paisa");
  });

  test("a reversed order voids its accrued usage bill in the same transaction", () => {
    const src = read(SHOP_LEDGER);
    const reversal = src.indexOf("export async function reverseShopOrder");
    const voidCall = src.indexOf("voidUsageBillForSource(tx");
    expect(reversal).toBeGreaterThan(-1);
    expect(voidCall).toBeGreaterThan(reversal);
    expect(read(BILLS_LEDGER)).toContain("status: 'void'");
  });

  test("accrued usage bills stay OUT of the Item 7 settlement path", () => {
    const src = read("lib/operatorSettlement.ts");
    expect(src).toContain("eq(operatorBills.kind, \"subscription_purchase\")");
    expect(src).not.toContain("'usage'");
  });

  test("migration 0099 adds the source key + one-bill-per-source barrier", () => {
    const sql = read("src/db/migrations/0099_operator_bills_source_order.sql");
    expect(sql).toContain("ADD COLUMN source_order_id uuid");
    expect(sql).toContain("operator_bills_source_order_uq");
    expect(sql).toContain("WHERE source_order_id IS NOT NULL");
    const journal = JSON.parse(read("src/db/migrations/meta/_journal.json")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((e) => e.tag)).toContain("0099_operator_bills_source_order");
  });
});
