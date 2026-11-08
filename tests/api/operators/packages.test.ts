/**
 * Batch-2 Item 6 — the three role-scoped package surfaces.
 *
 * Exercised end-to-end at the route layer with the REAL shared core
 * (lib/operatorPurchase) and only its money/grant dependencies mocked, so the
 * wiring — eligibility → identity → package load → core — is what is pinned:
 *   - ৳0 package: grant succeeds, NO bill (D4)
 *   - priced package: one open bill, due at the grant's expiry
 *   - wrong-role package: 409 package_not_applicable_to_role
 *   - inactive role: 403 role_not_eligible before any package read
 *   - list visibility: applicable_roles containment pinned for the role
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supa-user-1" })),
}));
jest.mock("@/lib/parseBody", () => ({
  parseJsonBody: jest.fn(async (request: Request) => ({ ok: true, data: await request.json() })),
}));
jest.mock("@/lib/launchRoles", () => ({
  heldRoles: jest.fn(async () => [{ role: "shop_owner", status: "active" }]),
}));
jest.mock("@/lib/commissionDues", () => ({ getOperatorUnpaidObligations: jest.fn() }));
jest.mock("@/lib/monetizationMode", () => {
  class OperatorPackageActiveError extends Error {}
  return { grantOperatorPackage: jest.fn(), OperatorPackageActiveError };
});
jest.mock("@/lib/billsLedger", () => {
  class BillSlotConflictError extends Error {}
  return { createOpenBill: jest.fn(), BillSlotConflictError };
});
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { heldRoles } from "@/lib/launchRoles";
import { getOperatorUnpaidObligations } from "@/lib/commissionDues";
import { grantOperatorPackage } from "@/lib/monetizationMode";
import { createOpenBill } from "@/lib/billsLedger";
import { POST as shopPurchase } from "@/app/api/shop/packages/purchase+api";
import { GET as shopList } from "@/app/api/shop/packages+api";
import { POST as deliveryPurchase } from "@/app/api/delivery/packages/purchase+api";
import { GET as deliveryList } from "@/app/api/delivery/packages+api";
import { POST as fleetPurchase } from "@/app/api/fleet/packages/purchase+api";
import { GET as fleetList } from "@/app/api/fleet/packages+api";

type Row = Record<string, unknown>;

const USER_ID = "11111111-1111-4111-a111-111111111111";
const OPERATOR_ID = "77777777-7777-4777-8777-777777777777";
const PACKAGE_ID = "88888888-8888-4888-8888-888888888888";
const EXPIRES_AT = new Date("2026-12-08T00:00:00.000Z");

function pkgRow(overrides: Row = {}): Row {
  return {
    id: PACKAGE_ID,
    name: "Shop Starter",
    call_count: 50,
    duration_days: 30,
    price_bdt: 5_000,
    daily_cap: 200,
    is_trial: false,
    is_active: true,
    product_type: "call_package",
    applicable_roles: ["shop"],
    ...overrides,
  };
}

let selectCalls: unknown[][];
let whereArgs: unknown[];

/** Rows-in queue: one result set per db.select call, in route order. */
function mockSelectQueue(queue: Row[][]): void {
  let i = 0;
  selectCalls = [];
  whereArgs = [];
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[i] ?? [];
    i++;
    selectCalls.push(rows);
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      where: (cond: unknown) => {
        whereArgs.push(cond);
        return chain;
      },
      orderBy: () => chain,
      limit: async () => rows,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
      catch: (reject: (e: unknown) => void) => Promise.resolve(rows).catch(reject),
    };
    return chain;
  });
}

function purchaseRequest(): Request {
  return { json: async () => ({ package_id: PACKAGE_ID }) } as unknown as Request;
}

function listRequest(): Request {
  return { headers: { get: () => "valid-token" } } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  (heldRoles as jest.Mock).mockResolvedValue([{ role: "shop_owner", status: "active" }]);
  (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue({
    unpaidSubscriptionPaisa: 0,
    netCommissionPaisa: 0,
    totalUnpaidPaisa: 0,
    activeSelfBillPaisa: 0,
    lockoutExposurePaisa: 0,
  });
  (grantOperatorPackage as jest.Mock).mockResolvedValue({
    id: "grant-1",
    operator_role: "shop",
    operator_id: OPERATOR_ID,
    package_id: PACKAGE_ID,
    status: "active",
    expires_at: EXPIRES_AT,
  });
  (createOpenBill as jest.Mock).mockResolvedValue({
    id: "bill-1",
    operator_id: OPERATOR_ID,
    operator_role: "shop",
    amount_bdt: 5_000,
    due_at: EXPIRES_AT,
    status: "open",
  });
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: jest.fn(async () => []) }),
  );
});

describe("GET /api/{shop,delivery,fleet}/packages — list visibility", () => {
  const cases = [
    { role: "shop", handler: shopList, launch: "shop_owner" },
    { role: "delivery", handler: deliveryList, launch: "delivery_man" },
    { role: "fleet", handler: fleetList, launch: "fleet_owner" },
  ] as const;

  test.each(cases)("$role list pins applicable_roles containment for '$role'", async ({ role, handler, launch }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "active" }]);
    mockSelectQueue([[{ id: USER_ID }], [{ ...pkgRow(), applicable_roles: [role, "driver"] }]]);

    const res = await handler(listRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { packages: Row[] };
    expect(body.packages).toHaveLength(1);

    // The packages select is the LAST where-arg built (the first is the user lookup).
    const query = new PgDialect().sqlToQuery(whereArgs[whereArgs.length - 1] as never);
    expect(query.sql).toContain('"packages"."applicable_roles"');
    expect(query.sql).toContain("@> ARRAY[");
    expect(query.params).toContain(role);
  });

  test("an inactive role cannot list (403 role_not_eligible, no package read)", async () => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: "shop_owner", status: "pending" }]);
    mockSelectQueue([[{ id: USER_ID }]]);

    const res = await shopList(listRequest());
    expect(res.status).toBe(403);
    expect(((await res.json()) as Row).error).toBe("role_not_eligible");
    expect(selectCalls).toHaveLength(1); // user lookup only
  });
});

describe("POST role-scoped purchase — shared core wiring", () => {
  const cases = [
    { role: "shop", handler: shopPurchase, launch: "shop_owner" },
    { role: "delivery", handler: deliveryPurchase, launch: "delivery_man" },
    { role: "fleet", handler: fleetPurchase, launch: "fleet_owner" },
  ] as const;

  test.each(cases)("$role priced package creates exactly one open bill", async ({ role, handler, launch }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "active" }]);
    mockSelectQueue([
      [{ id: USER_ID }], // user lookup
      [{ id: OPERATOR_ID }], // operator identity (role-specific ownership lookup)
      [pkgRow({ applicable_roles: [role] })], // package load
    ]);

    const res = await handler(purchaseRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Row;
    expect(body).toMatchObject({
      activated: true,
      mode: "operator_package",
      operator_role: role,
      operator_id: OPERATOR_ID,
      payment_url: null,
      bill: { id: "bill-1" },
    });
    expect(grantOperatorPackage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operatorRole: role, operatorId: OPERATOR_ID }),
    );
    expect(createOpenBill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operatorRole: role,
        operatorId: OPERATOR_ID,
        amountBdt: 5_000,
        dueAt: EXPIRES_AT,
      }),
    );
  });

  test.each(cases)("$role ৳0 package grants with NO bill (D4)", async ({ role, handler, launch }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "active" }]);
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: OPERATOR_ID }],
      [pkgRow({ applicable_roles: [role], price_bdt: 0, is_trial: true })],
    ]);

    const res = await handler(purchaseRequest());
    expect(res.status).toBe(200);
    expect(((await res.json()) as Row).bill).toBeNull();
    expect(grantOperatorPackage).toHaveBeenCalledTimes(1);
    expect(createOpenBill).not.toHaveBeenCalled();
  });

  test.each(cases)("$role: a driver-only package is rejected (409 package_not_applicable_to_role)", async ({ handler, launch }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "active" }]);
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: OPERATOR_ID }],
      [pkgRow({ applicable_roles: ["driver"] })],
    ]);

    const res = await handler(purchaseRequest());
    expect(res.status).toBe(409);
    expect(((await res.json()) as Row).error).toBe("package_not_applicable_to_role");
    expect(grantOperatorPackage).not.toHaveBeenCalled();
    expect(createOpenBill).not.toHaveBeenCalled();
  });

  test("settle-first block surfaces as 409 dues_outstanding_purchase_blocked", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue({
      unpaidSubscriptionPaisa: 2_500,
      netCommissionPaisa: 0,
      totalUnpaidPaisa: 2_500,
      activeSelfBillPaisa: 0,
      lockoutExposurePaisa: 2_500,
    });
    mockSelectQueue([[{ id: USER_ID }], [{ id: OPERATOR_ID }], [pkgRow()]]);

    const res = await shopPurchase(purchaseRequest());
    expect(res.status).toBe(409);
    const body = (await res.json()) as Row;
    expect(body.error).toBe("dues_outstanding_purchase_blocked");
    expect(body.total_unpaid_paisa).toBe(2_500);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("an inactive role cannot purchase (403 before identity/package reads)", async () => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: "shop_owner", status: "suspended" }]);
    mockSelectQueue([[{ id: USER_ID }]]);

    const res = await shopPurchase(purchaseRequest());
    expect(res.status).toBe(403);
    expect(selectCalls).toHaveLength(1);
  });

  test("an inactive or missing package is 422 package_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: OPERATOR_ID }], [{ ...pkgRow(), is_active: false }]]);
    const res = await shopPurchase(purchaseRequest());
    expect(res.status).toBe(422);
    expect(((await res.json()) as Row).error).toBe("package_not_found");
  });
});
