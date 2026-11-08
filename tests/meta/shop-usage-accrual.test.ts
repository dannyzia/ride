/**
 * Batch-2 Item 8/8b — shop/restaurant postpaid billing wiring.
 *
 * Pins the shape that keeps the money model coherent:
 *   - one AGGREGATE open usage bill per shop (increment, never a second row);
 *   - the accrual is package-gated: only a shop with an ACTIVE possession whose
 *     package carries a positive rate accrues;
 *   - A-1 precedence: that rate REPLACES the legacy shop_commission_percent,
 *     which is therefore never read on the package path;
 *   - POSTPAID-GROSS (8b): the accrual path writes NO commission debit to
 *     shop_ledger, so the same fee is never represented twice. The legacy debit
 *     lives only in the else branch, byte-for-byte for unpackaged shops;
 *   - reversal mirrors whichever pair was written;
 *   - settlement: ONE payment clears the whole open usage set (8b), while a
 *     subscription bill stays 1:1 (migration 0100 scopes the barrier).
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SHOP_LEDGER = "lib/shopLedger.ts";
const BILLS_LEDGER = "lib/billsLedger.ts";
const SETTLEMENT = "lib/operatorSettlement.ts";

describe("shop usage accrual (Batch-2 Item 8/8b)", () => {
  test("single writer: shopLedger accrues through billsLedger, never by inserting operator_bills", () => {
    const src = read(SHOP_LEDGER);
    expect(src).toContain("accrueUsageBill");
    expect(src).toContain("reduceUsageBillForReversal");
    expect(src).not.toContain("operatorBills");
  });

  test("A-1 rate precedence: package rate replaces the legacy percent", () => {
    const src = read(SHOP_LEDGER);
    expect(src).toContain("isOperatorPackageActive");
    expect(src).toContain('source: "package"');
    expect(src).toContain('source: "legacy"');
    expect(src).toContain('source: "none"');
    expect(src).toContain("packagePercent > 0");
    // No package rows at all → the legacy read (the byte-for-byte branch).
    expect(src).toContain("possession.length === 0");
  });

  test("postpaid-gross: the accrual path writes NO commission debit (mutually exclusive pair)", () => {
    const src = read(SHOP_LEDGER);
    const commissionBranch = src.indexOf("if (commissionBdt > 0) {");
    const accrual = src.indexOf("await accrueUsageBill(tx");
    const debit = src.indexOf('entry_type: "commission"');
    expect(commissionBranch).toBeGreaterThan(-1);
    expect(accrual).toBeGreaterThan(commissionBranch);
    // The ledger debit appears only AFTER the package branch (i.e. in the else).
    expect(debit).toBeGreaterThan(accrual);
    expect(src).toContain("accruedBdt = commissionBdt");
    expect(src).toContain("usage_accrued_bdt: accruedBdt");
    // One of the two legs is always zero on the returned shape.
    expect(src).toContain("commission_bdt: -commissionBdt + accruedBdt");
  });

  test("reversal mirrors the written pair: bill reduction XOR ledger unwind", () => {
    const src = read(SHOP_LEDGER);
    expect(src).toContain("ledgerCommission === 0");
    expect(src).toContain("readOrderSubtotal");
    expect(src).toContain("reduceUsageBillForReversal(tx");
  });

  test("the aggregate writer locks the usage slot and increments in place", () => {
    const src = read(BILLS_LEDGER);
    expect(src).toContain("usage_bill_${params.operatorRole}:${params.operatorId}");
    expect(src).toContain("kind: 'usage'");
    expect(src).toContain("due_at: null");
    expect(src).toContain("amount_bdt: next");
    expect(src).toContain("reduceUsageBillForReversal");
    // A zeroed bill is voided so it leaves the owed figure.
    expect(src).toContain("status: next === 0 ? 'void' : 'open'");
  });

  test("ONE payment settles EVERY stamped usage bill (8b aggregate settlement)", () => {
    const src = read(BILLS_LEDGER);
    expect(src).toContain("SETTLEABLE_BILL_KINDS");
    expect(src).toContain("'subscription_purchase', 'usage'");
    expect(src).toContain("settleStampedBills");
    expect(src).toContain("billIds: settleable.map((b) => b.id)");
    // Locks are taken per distinct operator, in sorted order (no deadlock).
    expect(src).toContain("Array.from(\n    new Set(");
  });

  test("the settlement rail prices the whole open usage set as one invoice", () => {
    const src = read(SETTLEMENT);
    expect(src).toContain("initiateUsageSettlement");
    expect(src).toContain("findOpenUsageBills");
    expect(src).toContain("Commission Dues");
    expect(src).toContain('"amount_changed"');
    // Nothing is marked settled at initiation — the callback settles on payment.
    expect(src).toContain("the bills stay OPEN until the payment is confirmed");
  });

  test("the statement still itemizes usage separately (state precedence unchanged)", () => {
    const src = read(SETTLEMENT);
    expect(src).toContain("open_subscription_bills");
    expect(src).toContain("open_usage_bills");
    expect(src).toContain('"NO_PRODUCT"');
    expect(src).toContain("DUST_DUES_PAISA");
  });

  test("every bill kind the purchase gate counts is settleable (no gate deadlock)", () => {
    const settlement = read(SETTLEMENT);
    expect(settlement).toContain("OPERATOR_BILL_KIND_ORDER");
    expect(settlement).toContain('"subscription_purchase",\n  "usage",');
    expect(settlement).toContain("resolveOpenBill");
    const view = read("src/db/migrations/0097_operator_unpaid_obligations.sql");
    expect(view).toContain("kind = 'subscription_purchase'");
    expect(view).toContain("kind <> 'subscription_purchase'");
  });

  test("migrations 0099/0100 create the usage slot and scope the event barrier", () => {
    const slot = read("src/db/migrations/0099_operator_bills_usage_slot.sql");
    expect(slot).toContain("operator_bills_one_open_usage_uq");
    expect(slot).toContain("WHERE status = 'open' AND kind = 'usage'");

    const scope = read("src/db/migrations/0100_operator_bills_event_scope.sql");
    expect(scope).toContain("DROP INDEX IF EXISTS operator_bills_payment_event_uq");
    expect(scope).toContain(
      "WHERE payment_event_id IS NOT NULL AND kind = 'subscription_purchase'",
    );

    const schema = read("src/db/schema.ts");
    expect(schema).toContain(
      "${t.payment_event_id} IS NOT NULL AND ${t.kind} = 'subscription_purchase'",
    );

    const journal = JSON.parse(read("src/db/migrations/meta/_journal.json")) as {
      entries: { tag: string }[];
    };
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain("0099_operator_bills_usage_slot");
    expect(tags).toContain("0100_operator_bills_event_scope");
    expect(tags).not.toContain("0099_operator_bills_source_order");
  });
});
