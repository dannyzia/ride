/**
 * Batch-2 Item 6 — the driver purchase path is BYTE-FOR-BYTE unchanged.
 *
 * The non-driver generalization lives in lib/operatorPurchase.ts and the three
 * role-scoped routes. The driver rail must keep its own subscriptions /
 * enrollments lanes: if `app/api/package/purchase+api.ts` ever imports the
 * shared operator core (or drops its own settle-first read or advisory lock),
 * the driver contract has been rewritten by accident. These source pins make
 * that a test failure instead of a code review catch.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DRIVER_ROUTE = "app/api/package/purchase+api.ts";
const OPERATOR_ROUTES = [
  "app/api/shop/packages/purchase+api.ts",
  "app/api/delivery/packages/purchase+api.ts",
  "app/api/fleet/packages/purchase+api.ts",
];
const OPERATOR_LISTS = [
  "app/api/shop/packages+api.ts",
  "app/api/delivery/packages+api.ts",
  "app/api/fleet/packages+api.ts",
];

describe("driver purchase path is unchanged (Batch-2 Item 6)", () => {
  const driverSrc = read(DRIVER_ROUTE);

  test("the driver route does NOT use the shared non-driver core", () => {
    expect(driverSrc).not.toContain("operatorPurchase");
    expect(driverSrc).not.toContain("purchaseOperatorPackage");
    expect(driverSrc).not.toContain("grantOperatorPackage");
  });

  test("the driver route keeps its own settle-first read and advisory lock", () => {
    expect(driverSrc).toContain("getDriverUnpaidObligations");
    expect(driverSrc).toContain("DuesOutstandingError");
    expect(driverSrc).toContain("pg_advisory_xact_lock(hashtext('purchase_bill_'");
    // Both checkpoints — pre-check and the in-tx re-check.
    expect(driverSrc.match(/getDriverUnpaidObligations\(/g)).toHaveLength(2);
  });

  test("the driver route still owns its postpaid lanes", () => {
    expect(driverSrc).toContain("x-client-postpaid");
    expect(driverSrc).toContain("grantSubscriptionOnCredit");
    expect(driverSrc).toContain("enrollCommission");
  });

  test.each(OPERATOR_ROUTES)("%s calls the shared operator core", (rel) => {
    const src = read(rel);
    expect(src).toContain("purchaseOperatorPackage");
    expect(src).not.toContain("getDriverUnpaidObligations");
  });

  test.each(OPERATOR_LISTS)("%s pins its operator role for list visibility", (rel) => {
    expect(read(rel)).toContain("listOperatorPackages");
  });

  test("FAULT: a driver route that imported the operator core would be detected", () => {
    const hypothetical = `${driverSrc}\nimport { purchaseOperatorPackage } from "@/lib/operatorPurchase";\n`;
    expect(hypothetical).not.toBe(driverSrc);
    expect(hypothetical).toContain("purchaseOperatorPackage");
    // The real assertion above (`not.toContain`) is what fails on this string.
    expect(driverSrc).not.toContain("purchaseOperatorPackage");
  });
});
