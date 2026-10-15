/**
 * S7 (plan 27 §7) — admin marketplace ops + verification queue completion.
 *
 * Covers the three surfaces this stage adds, at the level each is decidable:
 *
 *  1. lib/shopLedger.reverseShopOrder — the LEDGER REVERSAL (a money path), with
 *     a hand-rolled tx so the assertions ARE the SQL shapes: one `reversal` row
 *     equal to the negative of everything the order booked, nothing written when
 *     no money moved, nothing written when one already exists.
 *  2. POST /api/admin/marketplace/orders (force_cancel) — the state rule
 *     (settled → refunded + reversal; otherwise → cancelled) plus the A1/A3
 *     contracts: reason code REQUIRED, audit_logs written, customer notified
 *     WITH the reason, already-resolved → 409, RBAC → 403.
 *  3. GET /api/admin/driver/type-changes + the reject path — the queue exists,
 *     and a reject persists the F-30 structured payload (internal_note included)
 *     while returning an applicant-safe view WITHOUT it.
 *
 * The db stub is a Proxy: every chained method returns the same awaitable node,
 * so the tests assert on recorded writes rather than re-implementing drizzle's
 * builder grammar (which drifts and produced false greens in earlier harnesses).
 */
/* eslint-disable import/first */
import { jest } from "@jest/globals";

// The db module throws without DATABASE_URL; the stub is installed per-test by
// installDb(). Nothing here reaches a real connection.
jest.mock("@/src/db", () => ({ db: {} }));
jest.mock("@/lib/adminRbac", () => ({ requireAdminPermission: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/notify", () => ({ sendNotification: jest.fn(async () => undefined) }));
jest.mock("@/lib/wsNotify", () => ({ notifyWs: jest.fn() }));
jest.mock("@/lib/platformConfig", () => ({ requireConfigInt: jest.fn(async () => 0) }));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { sendNotification } from "@/lib/notify";
import { reverseShopOrder, type ShopTx } from "@/lib/shopLedger";
import { GET as typeChangesGET } from "@/app/api/admin/driver/type-changes+api";
import { POST as typeChangePOST } from "@/app/api/admin/driver/type-change-approve+api";
import { GET as ordersGET, POST as ordersPOST } from "@/app/api/admin/marketplace/orders+api";
import { GET as monitoringGET } from "@/app/api/admin/monitoring-rows+api";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const CHANGE_ID = "55555555-5555-4555-8555-555555555555";

/* ────────────────────────── harness ────────────────────────── */

interface Recorded {
  updates: Record<string, unknown>[];
  insertValues: Record<string, unknown>[];
}

/** An awaitable node whose every property is a chainable method. */
function node(rows: unknown[], rec: Recorded, extra?: { returning?: unknown[] }) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
        }
        if (prop === "set") {
          return (vals: Record<string, unknown>) => {
            rec.updates.push(vals);
            return proxy;
          };
        }
        if (prop === "values") {
          return (vals: Record<string, unknown>) => {
            rec.insertValues.push(vals);
            return proxy;
          };
        }
        return () => proxy;
      },
    },
  );
  void extra;
  return proxy;
}

/**
 * Install a db stub. `selectQueue` is consumed one entry per select() — a route
 * that reads twice needs two entries; the last entry repeats once exhausted.
 */
function installDb(selectQueue: unknown[][], rec?: Recorded): Recorded {
  const recorded: Recorded = rec ?? { updates: [], insertValues: [] };
  const queue = [...selectQueue];
  let last: unknown[] = [];
  const takeRows = (): unknown[] => {
    if (queue.length > 0) last = queue.shift()!;
    return last;
  };
  const d = db as unknown as Record<string, unknown>;
  d.select = jest.fn(() => node(takeRows(), recorded));
  d.update = jest.fn(() => node([], recorded));
  d.insert = jest.fn(() => node([], recorded));
  // Inside the tx each read consumes its OWN queue entry (order row, restock
  // items, then the ledger) — a single collapsed row set would make the reversal
  // read the order row and do NaN arithmetic.
  const tx = {
    select: jest.fn(() => node(takeRows(), recorded)),
    update: jest.fn(() => node([{ id: ORDER_ID }], recorded)),
    insert: jest.fn(() => node([], recorded)),
  };
  d.transaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
  return recorded;
}

function grant(ok = true): void {
  (requireAdminPermission as jest.Mock).mockImplementation(() =>
    ok
      ? async () => ({ supabaseUser: { id: "sb" }, dbUser: { id: ADMIN_ID, role: "admin" } })
      : async () => {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        },
  );
}

function req(body?: unknown, url = "http://x/api"): Request {
  return {
    url,
    json: body === undefined ? undefined : async () => body,
    headers: { get: () => null },
  } as unknown as Request;
}

const ORDER = {
  id: ORDER_ID,
  shop_id: SHOP_ID,
  rider_user_id: CUSTOMER_ID,
  status: "preparing",
  subtotal_bdt: 10_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  grant(true);
});

/* ─────────────── 1. the reversal writer (money path) ─────────────── */

function handTx(existing: { entry_type: string; amount_bdt: number }[]) {
  const inserts: Record<string, unknown>[] = [];
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({ where: jest.fn(() => ({ then: (r: (v: unknown) => unknown) => r(existing) })) })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        inserts.push(vals);
        return { then: (r: (v: unknown) => unknown) => r(vals) };
      }),
    })),
  } as unknown as ShopTx;
  return { tx, inserts };
}

describe("shopLedger.reverseShopOrder (§7 A1 — ledger reversal)", () => {
  it("appends ONE reversal row equal to the negative of everything booked", async () => {
    const { tx, inserts } = handTx([
      { entry_type: "order_revenue", amount_bdt: 10_000 },
      { entry_type: "commission", amount_bdt: -800 },
    ]);

    const out = await reverseShopOrder(
      tx,
      { id: ORDER_ID, shop_id: SHOP_ID },
      { reason: "force_cancel:dispute_resolved" },
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      entry_type: "reversal",
      amount_bdt: -9_200, // 10 000 credit − 800 commission, unwound in one row
      note: "force_cancel:dispute_resolved",
    });
    expect(out).toEqual({ reversed_bdt: -9_200 });
  });

  it("writes NOTHING when no money moved (never-settled order)", async () => {
    const { tx, inserts } = handTx([]);
    const out = await reverseShopOrder(tx, { id: ORDER_ID, shop_id: SHOP_ID }, { reason: "x" });
    expect(inserts).toHaveLength(0);
    expect(out.reversed_bdt).toBe(0);
  });

  it("is idempotent: an existing reversal blocks a second one", async () => {
    const { tx, inserts } = handTx([
      { entry_type: "order_revenue", amount_bdt: 5_000 },
      { entry_type: "reversal", amount_bdt: -5_000 },
    ]);
    const out = await reverseShopOrder(tx, { id: ORDER_ID, shop_id: SHOP_ID }, { reason: "again" });
    expect(inserts).toHaveLength(0);
    expect(out.reversed_bdt).toBe(0);
  });
});

/* ─────────────── 2. force-cancel route ─────────────── */

describe("POST /api/admin/marketplace/orders — force_cancel (§7 A1/A3)", () => {
  it("rejects a request with NO reason code (the code is REQUIRED)", async () => {
    installDb([[ORDER]]);
    const res = await ordersPOST(req({ action: "force_cancel", order_id: ORDER_ID }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown reason code", async () => {
    installDb([[ORDER]]);
    const res = await ordersPOST(
      req({ action: "force_cancel", order_id: ORDER_ID, reason_code: "because" }),
    );
    expect(res.status).toBe(400);
  });

  it("pre-delivery → cancelled, no reversal when no money moved", async () => {
    installDb([[ORDER], [], []]); // order, restock items, ledger rows
    const res = await ordersPOST(
      req({ action: "force_cancel", order_id: ORDER_ID, reason_code: "customer_request" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("cancelled");
    expect(body.reversed_bdt).toBe(0);
  });

  it("settled order → refunded WITH a ledger reversal", async () => {
    // A settled order is not restocked, so the tx reads are: order, ledger.
    installDb([
      [{ ...ORDER, status: "delivered" }],
      [
        { entry_type: "order_revenue", amount_bdt: 10_000 },
        { entry_type: "commission", amount_bdt: 0 },
      ],
    ]);
    const res = await ordersPOST(
      req({
        action: "force_cancel",
        order_id: ORDER_ID,
        reason_code: "dispute_resolved",
        reason_text: "goods damaged",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("refunded");
    expect(body.reversed_bdt).toBe(-10_000);
  });

  it("notifies the customer WITH the reason and writes audit_logs", async () => {
    const rec = installDb([[ORDER], [], []]);
    await ordersPOST(
      req({
        action: "force_cancel",
        order_id: ORDER_ID,
        reason_code: "fraud_suspected",
        reason_text: "fake orders",
      }),
    );

    // A3: the decision is audited.
    expect(rec.insertValues.some((v) => v.action === "marketplace_order_force_cancelled")).toBe(true);
    // A1/A3: the reason reaches the affected user.
    const call = (sendNotification as jest.Mock).mock.calls.at(-1) as unknown[];
    expect(String(call[3])).toContain("fraud_suspected");
    expect(String(call[3])).toContain("fake orders");
  });

  it("409s an already-resolved order (no second reversal)", async () => {
    installDb([[{ ...ORDER, status: "cancelled" }]]);
    const res = await ordersPOST(
      req({ action: "force_cancel", order_id: ORDER_ID, reason_code: "other" }),
    );
    expect(res.status).toBe(409);
  });

  it("403s a caller without marketplace.write", async () => {
    grant(false);
    installDb([[ORDER]]);
    const res = await ordersPOST(
      req({ action: "force_cancel", order_id: ORDER_ID, reason_code: "other" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/marketplace/orders — read-across (§7 A1)", () => {
  it("lists orders honouring the filter set", async () => {
    installDb([[ORDER], [{ count: 1 }]]);
    const res = await ordersGET(
      req(undefined, "http://x/api?status=delivered&limit=5"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.limit).toBe(5);
    expect(Array.isArray(body.orders)).toBe(true);
  });

  it("400s a malformed filter rather than silently ignoring it", async () => {
    installDb([[]]);
    const res = await ordersGET(req(undefined, "http://x/api?customer_id=not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

/* ─────────────── 3. type-change queue ─────────────── */

describe("GET /api/admin/driver/type-changes — the queue (§7 F-30/E2)", () => {
  it("lists pending changes with the driver and the live type", async () => {
    installDb([
      [
        {
          change_id: CHANGE_ID,
          driver_id: "d1",
          driver_name: "Karim",
          old_vehicle_type: "bike_basic",
          new_vehicle_type: "car_economy",
          status: "pending",
          current_vehicle_type: "bike_basic",
        },
      ],
      [{ count: 1 }],
    ]);
    const res = await typeChangesGET(req(undefined, "http://x/api?status=pending"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: unknown[]; total: number };
    expect(body.total).toBe(1);
    expect(body.changes).toHaveLength(1);
  });

  it("400s an unknown status value", async () => {
    installDb([[]]);
    const res = await typeChangesGET(req(undefined, "http://x/api?status=banana"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/driver/type-change-approve — reject (§7 F-30)", () => {
  it("persists the structured reason (internal_note included) but returns an applicant-safe view", async () => {
    const rec = installDb([
      [
        {
          id: CHANGE_ID,
          driver_id: "d1",
          status: "pending",
          old_vehicle_type: "bike_basic",
          new_vehicle_type: "car_economy",
          reason_text: "upgrade",
        },
      ],
    ]);

    const res = await typeChangePOST(
      req({
        change_id: CHANGE_ID,
        action: "reject",
        reason: "the registration document does not match the requested class",
        code: "mismatch",
        field: "vehicle registration document",
        example: "a BRTA certificate naming the requested class",
        internal_note: "repeat requester — watch for resubmits",
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reject: Record<string, unknown> };
    // The driver-visible payload never carries the internal note.
    expect(body.reject).toMatchObject({ code: "mismatch" });
    expect(body.reject.internal_note).toBeUndefined();

    const stored = rec.updates[0].reject_details as Record<string, unknown>;
    expect(stored).toMatchObject({
      code: "mismatch",
      internal_note: "repeat requester — watch for resubmits",
    });

    expect(rec.insertValues.some((v) => v.action === "vehicle_type_change_rejected")).toBe(true);
  });
});

/* ─────────────── 4. monitoring rows ─────────────── */

describe("GET /api/admin/monitoring-rows (§7 A5)", () => {
  it("returns the six read-only rows", async () => {
    installDb([[], [], [], [], [], []]);
    const res = await monitoringGET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { key: string }[] };
    expect(body.rows.map((r) => r.key)).toEqual([
      "pending_shop_verifications",
      "pending_fleet_verifications",
      "pending_vehicle_type_changes",
      "active_shops",
      "delivery_legs_today",
      "couriers_online",
    ]);
  });

  it("403s a caller without admin.read", async () => {
    grant(false);
    installDb([[]]);
    const res = await monitoringGET(req());
    expect(res.status).toBe(403);
  });
});
