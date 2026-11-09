/**
 * Batch-2 Item 10 — the fleet fold-in's CODE half.
 *
 * The migration converts the data; this file pins what the code does with it:
 *
 *   - the legacy purchase/renewal writers are WITHDRAWN (410, with the
 *     replacement named) and write nothing;
 *   - the Item 6 rail is the fleet's purchase surface post-fold — grant + bill,
 *     settle-first, one open bill, one active possession;
 *   - a fleet package carrying a commission rate is rejected
 *     (fleet_commission_unsupported) instead of silently ignoring it;
 *   - the marketplace entitlement now reads POSSESSION (operator_packages,
 *     role='fleet') through the same predicate every possession consumer uses.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supa-user-1" })),
}));
jest.mock("@/lib/supabaseServer", () => {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.is = jest.fn(() => chain);
  chain.in = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => ({ data: null }));
  return { supabaseAdmin: { from: jest.fn(() => chain) } };
});
jest.mock("@/lib/monetizationMode", () => ({
  ...jest.requireActual("@/lib/monetizationMode"),
  grantOperatorPackage: jest.fn(),
}));
jest.mock("@/lib/billsLedger", () => {
  class BillSlotConflictError extends Error {}
  return { createOpenBill: jest.fn(), BillSlotConflictError };
});
jest.mock("@/lib/commissionDues", () => ({ getOperatorUnpaidObligations: jest.fn() }));
jest.mock("@/lib/launchRoles", () => ({ heldRoles: jest.fn() }));
jest.mock("@/lib/parseBody", () => ({
  parseJsonBody: jest.fn(async (request: Request) => ({ ok: true, data: await request.json() })),
}));
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(() => async () => ({ dbUser: { id: "admin-1" } })),
}));
// marketplaceRbac re-exports the ambulance guard, which pulls h3-js (native/
// expo TextDecoder) — irrelevant to the fleet entitlement path under test.
jest.mock("@/lib/ambulanceCerts", () => ({ serviceLevelSatisfies: jest.fn(() => true) }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { heldRoles } from "@/lib/launchRoles";
import { getOperatorUnpaidObligations } from "@/lib/commissionDues";
import { grantOperatorPackage, OperatorPackageActiveError } from "@/lib/monetizationMode";
import { createOpenBill, BillSlotConflictError } from "@/lib/billsLedger";
import { POST as fleetPlansPost } from "@/app/api/fleet/plans+api";
import { POST as adminPlansPost, PATCH as adminPlansPatch } from "@/app/api/admin/fleet-plans+api";
import { POST as fleetPurchase } from "@/app/api/fleet/packages/purchase+api";
import { fleetMarketplaceEntitlements } from "@/lib/marketplaceRbac";

type Row = Record<string, unknown>;

const USER_ID = "11111111-1111-4111-a111-111111111111";
const FLEET_ID = "22222222-2222-4222-8222-222222222222";
const PACKAGE_ID = "33333333-3333-4333-8333-333333333333";
const EXPIRES_AT = new Date("2027-01-08T00:00:00.000Z");

/** A folded fleet plan: no lead leg, fleet applicability, priced. */
function fleetPkg(overrides: Row = {}): Row {
  return {
    id: PACKAGE_ID,
    name: "Fleet Pro (fleet)",
    call_count: 0,
    duration_days: 30,
    price_bdt: 250_000,
    daily_cap: 200,
    is_trial: false,
    is_active: true,
    product_type: "call_package",
    commission_percent: null,
    applicable_roles: ["fleet"],
    ...overrides,
  };
}

let selectQueue: Row[][];
let selectIndex: number;

function pushRows(...sets: Row[][]): void {
  selectQueue = sets;
  selectIndex = 0;
}

function chain(rows: Row[]): Record<string, unknown> {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    where: () => c,
    orderBy: () => c,
    limit: async () => rows,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (reject: (e: unknown) => void) => Promise.resolve(rows).catch(reject),
  };
  return c;
}

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue = [];
  selectIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => chain(selectQueue[selectIndex++] ?? []));
  (heldRoles as jest.Mock).mockResolvedValue([{ role: "fleet_owner", status: "active" }]);
  (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue({
    unpaidSubscriptionPaisa: 0,
    netCommissionPaisa: 0,
    totalUnpaidPaisa: 0,
    activeSelfBillPaisa: 0,
    lockoutExposurePaisa: 0,
  });
  (grantOperatorPackage as jest.Mock).mockResolvedValue({
    id: "grant-1",
    operator_role: "fleet",
    operator_id: FLEET_ID,
    package_id: PACKAGE_ID,
    status: "active",
    expires_at: EXPIRES_AT,
  });
  (createOpenBill as jest.Mock).mockResolvedValue({
    id: "bill-1",
    operator_role: "fleet",
    operator_id: FLEET_ID,
    amount_bdt: 250_000,
    due_at: EXPIRES_AT,
    status: "open",
  });
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: jest.fn(async () => []) }),
  );
});

function postRequest(body: unknown = {}): Request {
  return { json: async () => body } as unknown as Request;
}

function emptyRequest(): Request {
  return {} as unknown as Request;
}

describe("retired fleet-subscription writers (Batch-2 Item 10)", () => {
  it("POST /api/fleet/plans → 410 with the replacement rail named, and no writes", async () => {
    const res = await fleetPlansPost(postRequest({ plan_id: PACKAGE_ID }));
    expect(res.status).toBe(410);
    const body = (await res.json()) as Row;
    expect(body.error).toBe("fleet_plans_purchase_retired");
    expect(body.replacement).toBe("/api/fleet/packages/purchase");

    // The writer is gone: no possession move, no legacy row, no fee.
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("admin fleet-plan POST → 410 (a plan no rail can sell)", async () => {
    const res = await adminPlansPost(postRequest({ name: "Legacy", billing_period: "MONTHLY", price_bdt: 1 }));
    expect(res.status).toBe(410);
    expect(((await res.json()) as Row).error).toBe("fleet_plans_write_retired");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("admin fleet-plan PATCH → 410", async () => {
    const res = await adminPlansPatch(postRequest({ id: PACKAGE_ID, price_bdt: 9 }));
    expect(res.status).toBe(410);
    expect(((await res.json()) as Row).error).toBe("fleet_plans_write_retired");
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("fleet purchase on the Item 6 rail, post-fold", () => {
  it("a folded fleet package grants possession and opens exactly ONE bill", async () => {
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg()]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Row;
    expect(body).toMatchObject({
      activated: true,
      mode: "operator_package",
      operator_role: "fleet",
      operator_id: FLEET_ID,
      bill: { id: "bill-1", amount_bdt: 250_000 },
    });

    expect(grantOperatorPackage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operatorRole: "fleet", operatorId: FLEET_ID }),
    );
    expect(createOpenBill).toHaveBeenCalledTimes(1);
    // The receivable is due when the granted term ends.
    expect(createOpenBill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountBdt: 250_000, dueAt: EXPIRES_AT, subscriptionId: null }),
    );
  });

  it("settle-first runs twice (pool pre-check + under the purchase lock)", async () => {
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg()]);

    await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(getOperatorUnpaidObligations).toHaveBeenCalledTimes(2);
  });

  it("outstanding dues ≥ ৳10 block before any grant", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue({
      unpaidSubscriptionPaisa: 5_000,
      netCommissionPaisa: 0,
      totalUnpaidPaisa: 5_000,
      activeSelfBillPaisa: 0,
      lockoutExposurePaisa: 5_000,
    });
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg()]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as Row).error).toBe("dues_outstanding_purchase_blocked");
    expect(grantOperatorPackage).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("the one-open-bill index surfaces as 409, not a second receivable", async () => {
    (createOpenBill as jest.Mock).mockRejectedValue(new BillSlotConflictError());
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg()]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as Row).error).toBe("dues_outstanding_purchase_blocked");
  });

  it("the one-active-possession index surfaces as 409 active_package_exists", async () => {
    (grantOperatorPackage as jest.Mock).mockRejectedValue(new OperatorPackageActiveError());
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg()]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as Row).error).toBe("active_package_exists");
    expect(createOpenBill).not.toHaveBeenCalled();
  });
});

describe("fleet commission leg is unsupported in v1 (Item 10 §3)", () => {
  it("a commission-bearing package is rejected on the fleet rail (422)", async () => {
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg({ commission_percent: "5.00" })]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as Row;
    expect(body.error).toBe("fleet_commission_unsupported");
    expect(body.commission_percent).toBe("5.00");

    // Rejected as a shape error: nothing is granted and nothing is billed, so a
    // rate that no fleet billing event reads can never become an invisible debt.
    expect(grantOperatorPackage).not.toHaveBeenCalled();
    expect(createOpenBill).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("a shared {shop,fleet} package is rejected on the FLEET rail only", async () => {
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [
      fleetPkg({ applicable_roles: ["shop", "fleet"], commission_percent: "3.00" }),
    ]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as Row).error).toBe("fleet_commission_unsupported");
  });

  it("a 0% rate is not 'unsupported' — commission_percent 0 passes", async () => {
    pushRows([{ id: USER_ID }], [{ id: FLEET_ID }], [fleetPkg({ commission_percent: "0.00" })]);

    const res = await fleetPurchase(postRequest({ package_id: PACKAGE_ID }));
    expect(res.status).toBe(200);
    expect(grantOperatorPackage).toHaveBeenCalledTimes(1);
  });
});

describe("marketplace entitlement reads possession, not fleet_subscriptions", () => {
  function possessionRow(overrides: Row = {}): Row {
    return {
      fleet_id: FLEET_ID,
      fleet_name: "Dhaka Fleet",
      fleet_status: "ACTIVE",
      package_id: PACKAGE_ID,
      possession_status: "active",
      expires_at: new Date(Date.now() + 86_400_000),
      plan_active: true,
      plan_features: { marketplace_bidding: true },
      ...overrides,
    };
  }

  it("an ACTIVE possession on a marketplace plan qualifies", async () => {
    pushRows([possessionRow()]);

    const map = await fleetMarketplaceEntitlements([FLEET_ID]);
    expect(map.get(FLEET_ID)).toMatchObject({
      fleet_id: FLEET_ID,
      fleet_name: "Dhaka Fleet",
      package_id: PACKAGE_ID,
    });
  });

  it("an EXPIRED possession does not (isOperatorPackageActive, the shared predicate)", async () => {
    pushRows([possessionRow({ expires_at: new Date(Date.now() - 60_000) })]);
    const map = await fleetMarketplaceEntitlements([FLEET_ID]);
    expect(map.size).toBe(0);
  });

  it("a non-marketplace plan grants nothing (flag still governs)", async () => {
    pushRows([possessionRow({ plan_features: { marketplace_bidding: false } })]);
    expect((await fleetMarketplaceEntitlements([FLEET_ID])).size).toBe(0);
  });

  it("no capacity profile row (a bare fleet package) grants nothing", async () => {
    pushRows([possessionRow({ plan_active: null, plan_features: null })]);
    expect((await fleetMarketplaceEntitlements([FLEET_ID])).size).toBe(0);
  });

  it("an inactive plan grants nothing", async () => {
    pushRows([possessionRow({ plan_active: false })]);
    expect((await fleetMarketplaceEntitlements([FLEET_ID])).size).toBe(0);
  });

  it("a non-ACTIVE fleet grants nothing", async () => {
    pushRows([possessionRow({ fleet_status: "PENDING" })]);
    expect((await fleetMarketplaceEntitlements([FLEET_ID])).size).toBe(0);
  });

  it("no fleet ids → no query at all", async () => {
    const map = await fleetMarketplaceEntitlements([]);
    expect(map.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});

// `emptyRequest` is kept for readers wiring a route that takes no body.
void emptyRequest;
