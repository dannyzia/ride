/**
 * Batch-2 Item 9 — delivery platform-fee accrual wiring (source-shape pin).
 *
 * The behavioural mirror lives in tests/api/delivery/delivery-usage-hook.test.ts.
 * This file pins the SHAPE that keeps the money model coherent, so a future
 * refactor cannot quietly reintroduce a double charge or touch the COD ledger:
 *
 *   - one writer: the fee accrues through lib/billsLedger (never by inserting
 *     operator_bills here);
 *   - A-1 precedence: a package rate REPLACES `delivery_commission_percent`,
 *     which is therefore never read on the package path;
 *   - operator identity: couriers.id WHERE courier_type='food' (Item 6 map), so
 *     the bill is the row /api/delivery/dues settles;
 *   - postpaid-gross XOR: the accrual path withholds nothing at source;
 *   - reversal mirrors the written pair (bill reduction XOR earnings unwind);
 *   - D7: the COD remittance/hold code paths are untouched — no accrual, no
 *     revenue_model read, no bill write inside them.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DELIVERY_SETTLEMENT = "lib/deliverySettlement.ts";
const BILLS_LEDGER = "lib/billsLedger.ts";
const ADMIN_ORDERS = "app/api/admin/marketplace/orders+api.ts";

describe("delivery usage accrual (Batch-2 Item 9)", () => {
  test("single writer: the fee accrues through billsLedger, never by inserting operator_bills", () => {
    const src = read(DELIVERY_SETTLEMENT);
    expect(src).toContain("accrueUsageBill");
    expect(src).toContain("reduceUsageBillForReversal");
    expect(src).not.toContain("operatorBills");
  });

  test("A-1 rate precedence: the package rate replaces the legacy percent", () => {
    const src = read(DELIVERY_SETTLEMENT);
    expect(src).toContain("isOperatorPackageActive");
    expect(src).toContain("source: 'package'");
    expect(src).toContain("source: 'legacy'");
    expect(src).toContain("source: 'none'");
    expect(src).toContain("packagePercent > 0");
    // No possession rows at all → the legacy read (the byte-for-byte branch).
    expect(src).toContain("possession.length === 0");
    // The matrix reads the SAME possession table the shop path does.
    expect(src).toContain("eq(operatorPackages.operator_role, 'delivery')");
  });

  test("operator identity is the courier ENTITY (couriers.id, courier_type='food')", () => {
    const src = read(DELIVERY_SETTLEMENT);
    expect(src).toContain("eq(couriers.user_id, courierUserId)");
    expect(src).toContain("eq(couriers.courier_type, 'food')");
    expect(src).toContain("operatorRole: 'delivery'");
    expect(src).toContain("operatorId: rate.operatorId");
  });

  test("the delivering courier is resolved from the delivery record", () => {
    const src = read(DELIVERY_SETTLEMENT);
    expect(src).toContain("delivery_man_user_id: deliveries.delivery_man_user_id");
    expect(src).toContain("leg?.delivery_man_user_id ?? courierUserId");
    expect(src).toContain("resolveDeliveryFeeRate(tx, deliveringUserId)");
  });

  test("postpaid-gross: the accrual path withholds nothing at source (mutually exclusive pair)", () => {
    const src = read(DELIVERY_SETTLEMENT);
    const accrual = src.indexOf("await accrueUsageBill(tx");
    expect(accrual).toBeGreaterThan(-1);
    // The at-source deduction is cancelled inside the package branch only.
    const zeroed = src.indexOf("atSourceBdt = 0", accrual);
    expect(zeroed).toBeGreaterThan(accrual);
    expect(src).toContain("const netBdt = feeBdt - atSourceBdt");
    expect(src).toContain("usage_accrued_bdt: accruedBdt");
  });

  test("reversal mirrors the written pair: bill reduction XOR earnings unwind", () => {
    const src = read(DELIVERY_SETTLEMENT);
    const reversal = src.indexOf("export async function reverseDeliveryUsageForOrder");
    expect(reversal).toBeGreaterThan(-1);
    const body = src.slice(reversal);
    // Legacy pair (fee withheld) → skipped before any bill is touched.
    expect(body).toContain("if (row.commission_bdt > 0) continue;");
    expect(body).toContain("reduceUsageBillForReversal(tx");
    // Recomputed from the leg's own fee snapshot at today's package rate.
    expect(body).toContain("row.fee_bdt * rate.percent");
  });

  /** Body of one exported function (up to the next top-level declaration). */
  function functionBody(src: string, header: string): string {
    const start = src.indexOf(header);
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start + header.length);
    const next = rest.indexOf("\nexport ");
    return next === -1 ? rest : rest.slice(0, next);
  }

  test("D7: the COD remittance + dispatch-hold paths carry no accrual, no config revenue read", () => {
    const src = read(DELIVERY_SETTLEMENT);
    for (const header of [
      "export async function courierDebtHoldsDispatch",
      "export async function couriersOnDispatchHold",
    ]) {
      const custody = functionBody(src, header);
      expect(custody).toContain("courierRemittanceDues");
      expect(custody).not.toContain("accrueUsageBill");
      expect(custody).not.toContain("reduceUsageBillForReversal");
      expect(custody).not.toContain("operatorBills");
    }
    // The reversal hook never reads or writes the custody ledger, and nothing
    // here reads the platform-wide revenue_model switch (stays subscription_only).
    expect(functionBody(src, "export async function reverseDeliveryUsageForOrder")).not.toContain(
      "courierRemittanceDues",
    );
    expect(src).not.toContain("revenue_model");
  });

  test("the admin reversal path is the only caller, gated on a fresh shop reversal", () => {
    const src = read(ADMIN_ORDERS);
    expect(src).toContain("reverseDeliveryUsageForOrder");
    expect(src).toContain("if (reversed_bdt !== 0) {");
    // It runs inside the same force-cancel transaction, after the shop reversal.
    const shopReversal = src.indexOf("await reverseShopOrder(");
    const deliveryReversal = src.indexOf("reverseDeliveryUsageForOrder(tx");
    expect(shopReversal).toBeGreaterThan(-1);
    expect(deliveryReversal).toBeGreaterThan(shopReversal);
  });

  test("the aggregate writer still owns the slot/void rules the accrual depends on", () => {
    const src = read(BILLS_LEDGER);
    expect(src).toContain("usage_bill_${params.operatorRole}:${params.operatorId}");
    expect(src).toContain("status: next === 0 ? 'void' : 'open'");
  });
});
