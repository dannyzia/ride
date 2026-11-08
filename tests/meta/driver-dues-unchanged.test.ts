/**
 * Batch-2 Item 7 — driver dues rails unchanged, settlement contract intact.
 *
 * The non-driver statement/settlement lives in lib/operatorSettlement.ts and
 * three role routes. The driver dues read + dues/pay keep their own contracts
 * (driver view wrapper, commission_settlement default, driver-only bill
 * pinning) and must not start importing the operator core. The PortPos callback
 * keeps its settlement branch, now reaching non-driver bills through the bill's
 * pre-stamp instead of an identity on the event.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DRIVER_DUES = "app/api/driver/dues+api.ts";
const DRIVER_DUES_PAY = "app/api/driver/dues/pay+api.ts";
const OPERATOR_DUES = [
  "app/api/shop/dues+api.ts",
  "app/api/delivery/dues+api.ts",
  "app/api/fleet/dues+api.ts",
];

describe("driver dues rail is unchanged (Batch-2 Item 7)", () => {
  test("driver dues read keeps its own view wrapper", () => {
    const src = read(DRIVER_DUES);
    expect(src).toContain("getDriverUnpaidObligations");
    expect(src).not.toContain("getOperatorStatement");
    expect(src).not.toContain("operatorSettlement");
  });

  test("driver dues/pay keeps commission_settlement default and driver bill pinning", () => {
    const src = read(DRIVER_DUES_PAY);
    expect(src).toContain("commission_settlement");
    expect(src).toContain("getDriverUnpaidObligations");
    expect(src).not.toContain("initiateOperatorSettlement");
    expect(src).toContain("eq(operatorBills.operator_role, 'driver')");
  });

  test.each(OPERATOR_DUES)("%s uses the operator statement/settlement core", (rel) => {
    const src = read(rel);
    expect(src).toContain("getOperatorStatement");
    expect(src).toContain("initiateOperatorSettlement");
    expect(src).not.toContain("getDriverUnpaidObligations");
  });

  test("the callback keeps ONE settlement branch, resolved by the bill stamp", () => {
    const src = read("app/api/payment/portpos/callback+api.ts");
    expect(src).toContain("evt.purpose === 'subscription_settlement'");
    expect(src).toContain("settleSubscriptionBill(tx, { eventId: evt.id })");
    // The old driver_id-only guard would fail every stamped non-driver event.
    expect(src).not.toContain("subscription settlement missing driver_id");
  });

  test("settleSubscriptionBill resolves stamp-first with the driver fallback", () => {
    const src = read("lib/billsLedger.ts");
    expect(src).toContain("eq(operatorBills.payment_event_id, evt.id)");
    expect(src).toContain("eq(operatorBills.operator_role, 'driver')");
    expect(src).toContain("purchase_bill_${operatorId}");
    expect(src).toContain("purchase_bill_${operatorRole}:${operatorId}");
  });

  test("the settlement core stamps and asserts the M-09 floor", () => {
    const src = read("lib/operatorSettlement.ts");
    expect(src).toContain("payment_event_id: initiated.payment_event_id");
    expect(src).toContain("MIN_PAYMENT_BDT");
    expect(src).toContain("no_open_bill");
  });
});
