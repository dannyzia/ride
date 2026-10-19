/**
 * Custody identity tick (amendment to C5/C6-FIX acceptance, adopted):
 *
 * On every completion path (courier deliver, self_delivered) and both cancel
 * arms (customer + shop, C7-3 in scope), exactly the designated settlement
 * fires — once — per fulfillment type, and the tick identity holds:
 *   customer cash (subtotal + fee) == shop due + courier earnings
 * on both completion routes; on the courier path the remittance due equals
 * the shop's credited subtotal.
 *
 * These tests drive the REAL routes with the REAL settlers
 * (settleShopOrder + settleDeliveryLeg unmocked) and pin EXACT paisa amounts
 * off the RECORDED inserts — never off stubbed returns. A dropped money
 * write breaks the identity (fault-injection test at the bottom proves the
 * check itself is not vacuous).
 *
 * Out of scope here (pending D1-2 owner ruling): short-pay variants where
 * amount_collected < subtotal + fee. The full-collection tick below is
 * ruling-invariant.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  requireAnyRole: (_roles: string[]) => async () => ({ dbUser: { id: mockCurrentRider } }),
  requireMemberRoles: (_roles: string[]) => async () => ({ dbUser: { id: mockCurrentRider } }),
}));
jest.mock("@/lib/supabaseServer", () => ({ supabaseAdmin: {} }));
jest.mock("@/lib/marketplaceRbac", () => ({
  requireDeliveryAgent: jest.fn(async () => ({ dbUser: { id: "55555555-5555-4555-8555-555555555555" }, kind: "courier" })),
  requireShopMember: (_shopId: string, _roles?: readonly string[]) => async () => ({
    dbUser: { id: "66666666-6666-4666-8666-666666666666" },
    membership: { role: "OWNER" },
  }),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/platformConfig", () => ({
  // 0% launch commissions — the tick below pins the 0% math exactly.
  requireConfigInt: jest.fn(async (_key: string) => 0),
}));
jest.mock("@/lib/notify", () => ({
  sendNotifications: jest.fn(async () => undefined),
}));
jest.mock("@/lib/wsNotify", () => ({
  notifyWs: jest.fn(),
}));
jest.mock("@/lib/shopNotify", () => ({
  notifyCustomerOrderStatus: jest.fn(),
  notifyCustomerPartialAccept: jest.fn(),
  shopOrderRecipients: jest.fn(async () => []),
}));
jest.mock("@/lib/idempotency", () => ({
  driverErrorCode: jest.fn(() => null),
}));

import { db } from "@/src/db";
import {
  shopLedger,
  deliveryEarnings,
  courierRemittanceDues,
  deliveries,
  shopOrders,
  shopOrderItems,
  shopProducts,
  shops,
  shopMembers,
} from "@/src/db/schema";
import { POST as deliverLeg } from "@/app/api/delivery/active/[id]/action+api";
import { PATCH as patchStatus } from "@/app/api/shop/orders/[id]/status+api";
import { POST as cancelOrder } from "@/app/api/shop/orders/[id]/cancel+api";

type Row = Record<string, unknown>;

const LEG_ID = "11111111-1111-4111-a111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";
const COURIER_ID = "55555555-5555-4555-8555-555555555555";
const STAFF_ID = "66666666-6666-4666-8666-666666666666";
// Mutable: cancel/status tests set the rider caller.
let mockCurrentRider = "44444444-4444-4444-8444-444444444444";

// Tick fixtures: subtotal 20000 + fee 8000 = 28000 cash.
// Identity: 28000 == due 20000 + net 8000; due == shop revenue 20000.
const SUBTOTAL = 20000;
const FEE = 8000;
const CASH = SUBTOTAL + FEE;

const BASE_ORDER: Row = {
  id: ORDER_ID,
  shop_id: SHOP_ID,
  rider_user_id: RIDER_ID,
  status: "picked_up",
  subtotal_bdt: SUBTOTAL,
  delivery_fee_bdt: FEE,
  delivery_otp: "1234",
  pickup_code: "abcd",
};

const BASE_LEG: Row = {
  id: LEG_ID,
  status: "picked_up",
  delivery_man_user_id: COURIER_ID,
  order_id: ORDER_ID,
  source_vertical: "shop",
  delivery_fee_bdt: FEE,
  // Mock serves post-update state (the route stamps amount_collected in-tx
  // before settling; the mock has no persistence, so the row carries it).
  amount_collected_bdt: CASH,
};

let resolvers: Map<unknown, Row[]>;
let inserts: { table: unknown; values: Row }[];
let updates: { table: unknown; set: Row }[];
let updateReturnRows: Row[];

function chain(rows: Row[]) {
  const c: Record<string, unknown> = {
    from: jest.fn(() => c),
    where: jest.fn(() => c),
    // Thenable: covers both `.limit(1).for("update")` and direct awaits.
    limit: jest.fn(() => c),
    for: jest.fn(() => c),
    returning: jest.fn(async () => rows),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  };
  return c;
}

function wireDb() {
  const selectImpl = () => ({
    from: jest.fn((t: unknown) => chain(resolvers.get(t) ?? [])),
  });
  (db.select as jest.Mock).mockImplementation(selectImpl);
  const recordInsert = (table: unknown) => ({
    values: jest.fn((vals: Row) => {
      inserts.push({ table, values: vals });
      return Promise.resolve([{ id: "generated", ...vals }]);
    }),
  });
  (db.insert as jest.Mock).mockImplementation(recordInsert);
  const recordUpdate = (table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updates.push({ table, set: setObj });
      const whereResult = Promise.resolve(updateReturnRows) as Promise<Row[]> & {
        returning?: () => Promise<Row[]>;
      };
      whereResult.returning = async () => updateReturnRows;
      return { where: jest.fn(() => whereResult) };
    }),
  });
  (db.update as jest.Mock).mockImplementation(recordUpdate);
  const tx = { select: selectImpl, insert: recordInsert, update: recordUpdate };
  (db.transaction as jest.Mock).mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
}

function moneyInserts(table: unknown): Row[] {
  return inserts.filter((i) => i.table === table).map((i) => i.values);
}

/** The tick identity, computed off RECORDED rows only. */
function custodyHolds(records: { table: unknown; values: Row }[]): boolean {
  const revenue = records.filter((r) => r.table === shopLedger && r.values.entry_type === "order_revenue");
  const dues = records.filter((r) => r.table === courierRemittanceDues);
  const earnings = records.filter((r) => r.table === deliveryEarnings);
  if (revenue.length !== 1 || dues.length !== 1 || earnings.length !== 1) return false;
  const shopDue = Number(revenue[0].values.amount_bdt);
  const due = Number(dues[0].values.amount_bdt);
  const net = Number(earnings[0].values.net_bdt);
  return CASH === shopDue + net && due === shopDue;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentRider = "44444444-4444-4444-8444-444444444444";
  resolvers = new Map();
  inserts = [];
  updates = [];
  updateReturnRows = [{ id: ORDER_ID }];
  wireDb();
});

describe("custody identity — courier deliver (settleShopOrder + settleDeliveryLeg, once each)", () => {
  function deliverRequest(): Request {
    return {
      json: async () => ({ action: "deliver", otp: "1234", amount_collected_bdt: CASH }),
    } as unknown as Request;
  }

  beforeEach(() => {
    resolvers.set(deliveries, [{ ...BASE_LEG }]);
    resolvers.set(shopOrders, [{ ...BASE_ORDER }]);
    resolvers.set(shops, [{ owner_user_id: STAFF_ID }]);
    resolvers.set(shopMembers, []);
  });

  it("fires both settlers exactly once and the tick holds: cash == due + net, due == revenue", async () => {
    const res = await deliverLeg(deliverRequest(), { id: LEG_ID });
    expect(res.status).toBe(200);

    const revenue = moneyInserts(shopLedger).filter((v) => v.entry_type === "order_revenue");
    expect(revenue).toHaveLength(1);
    expect(revenue[0].amount_bdt).toBe(SUBTOTAL);

    const earnings = moneyInserts(deliveryEarnings);
    expect(earnings).toHaveLength(1);
    expect(earnings[0].fee_bdt).toBe(FEE);
    expect(earnings[0].commission_bdt).toBe(0);
    expect(earnings[0].net_bdt).toBe(FEE);

    const dues = moneyInserts(courierRemittanceDues);
    expect(dues).toHaveLength(1);
    expect(dues[0].amount_bdt).toBe(SUBTOTAL);

    expect(custodyHolds(inserts)).toBe(true);

    const body = await res.json();
    expect(body.settlement).toMatchObject({ earned_bdt: FEE, commission_bdt: 0, due_bdt: SUBTOTAL });
  });

  it("fault injection: a lost shop-revenue write breaks the identity (the check is not vacuous)", async () => {
    const res = await deliverLeg(deliverRequest(), { id: LEG_ID });
    expect(res.status).toBe(200);
    const neutered = inserts.filter(
      (i) => !(i.table === shopLedger && i.values.entry_type === "order_revenue"),
    );
    expect(custodyHolds(neutered)).toBe(false);
  });
});

describe("custody identity — self_delivered (shop revenue only, never the courier pair)", () => {
  function statusRequest(status: string): Request {
    return { json: async () => ({ status }) } as unknown as Request;
  }

  it("settleShopOrder fires once; no earnings/due rows; no leg writes", async () => {
    resolvers.set(shopOrders, [{ ...BASE_ORDER, status: "ready_for_pickup" }]);
    resolvers.set(deliveries, []);
    const res = await patchStatus(statusRequest("self_delivered"), { id: ORDER_ID });
    expect(res.status).toBe(200);

    const revenue = moneyInserts(shopLedger).filter((v) => v.entry_type === "order_revenue");
    expect(revenue).toHaveLength(1);
    expect(revenue[0].amount_bdt).toBe(SUBTOTAL);
    expect(moneyInserts(deliveryEarnings)).toHaveLength(0);
    expect(moneyInserts(courierRemittanceDues)).toHaveLength(0);
    expect(inserts.filter((i) => i.table === deliveries)).toHaveLength(0);
    expect(updates.filter((u) => u.table === deliveries)).toHaveLength(0);
  });
});

describe("custody identity — cancel arms fire no settlement (C7-3 in scope)", () => {
  it("customer cancel (pre-pickup): no money rows, leg failed, stock restored", async () => {
    resolvers.set(shopOrders, [{ ...BASE_ORDER, status: "pending", rider_user_id: RIDER_ID }]);
    resolvers.set(shopOrderItems, [{ product_id: "prod-1", quantity: 2 }]);
    const res = await cancelOrder({} as Request, { id: ORDER_ID });
    expect(res.status).toBe(200);

    expect(moneyInserts(shopLedger)).toHaveLength(0);
    expect(moneyInserts(deliveryEarnings)).toHaveLength(0);
    expect(moneyInserts(courierRemittanceDues)).toHaveLength(0);
    const legFails = updates.filter((u) => u.table === deliveries);
    expect(legFails.length).toBeGreaterThan(0);
    expect(legFails[0].set.status).toBe("failed");
    const restocks = updates.filter((u) => u.table === shopProducts);
    expect(restocks.length).toBeGreaterThan(0);
  });

  it("shop cancel (C7-3 arm): no money rows, accepted leg failed", async () => {
    resolvers.set(shopOrders, [{ ...BASE_ORDER, status: "accepted" }]);
    resolvers.set(deliveries, []);
    const res = await patchStatus({ json: async () => ({ status: "cancelled" }) } as unknown as Request, {
      id: ORDER_ID,
    });
    expect(res.status).toBe(200);

    expect(moneyInserts(shopLedger)).toHaveLength(0);
    expect(moneyInserts(deliveryEarnings)).toHaveLength(0);
    expect(moneyInserts(courierRemittanceDues)).toHaveLength(0);
    const legFails = updates.filter((u) => u.table === deliveries);
    expect(legFails.length).toBeGreaterThan(0);
    expect(legFails[0].set.status).toBe("failed");
  });
});
