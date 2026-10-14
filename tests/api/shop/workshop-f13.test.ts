// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * S4 (plan 27 §13, F-13) — workshop service-request customer surface:
 *   - POST /api/shop/[id]/workshop/requests — create (service + vehicle
 *     details + window), date/shop/service validation
 *   - lib/workshopSla.applyWorkshopSla — 2h confirm SLA AUTO-DECLINE with
 *     the F-29 keyed high-priority customer notification
 *   - GET /api/workshop/requests — customer list that sweeps the SLA BEFORE reading
 */
import { jest } from "@jest/globals";
import { POST as wreqCreate } from "@/app/api/shop/[id]/workshop/requests+api";
import { GET as myRequestsGet } from "@/app/api/workshop/requests+api";
import { applyWorkshopSla } from "@/lib/workshopSla";

// ── Mock state ───────────────────────────────────────────────────────────
const shopId = "00000000-0000-4000-8000-0000000000d1";
const serviceId = "00000000-0000-4000-8000-0000000000d2";
const customerId = "00000000-0000-4000-8000-0000000000d3";

let mockSelectQueue: (() => unknown[])[] = [];
let mockUpdateReturnQueue: (() => unknown[])[] = [];
let mockUpdateWhereCalls: unknown[][] = [];
let mockInsertValues: Record<string, unknown>[] = [];
let mockAuthUser: { id: string; role: string } = { id: customerId, role: "rider" };

jest.mock("@/src/db", () => {
  const thenable = (rows: unknown[]) => ({ then: (r: any) => r(rows) });

  // One queued slice per select(): the terminal await resolves it lazily
  // (cached, so from().innerJoin().where().orderBy().limit() shifts ONCE).
  const lazyRows = () => {
    let cached: unknown[] | null = null;
    return () => {
      if (cached === null) cached = mockSelectQueue.length ? mockSelectQueue.shift()!() : [];
      return cached;
    };
  };

  const makeSelect2 = () => () => ({
    from: () => {
      const get = lazyRows();
      const branch: any = {};
      const finish: any = () => {
        const c: any = () => {};
        c.limit = () => c;
        c.orderBy = () => c;
        c.for = () => c;
        c.leftJoin = () => c;
        c.innerJoin = () => c;
        c.then = (res: any, rej: any) => Promise.resolve(get()).then(res, rej);
        return c;
      };
      branch.where = () => finish();
      branch.orderBy = () => finish();
      branch.limit = () => finish();
      branch.leftJoin = () => branch;
      branch.innerJoin = () => branch;
      return branch;
    },
  });

  const makeUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...args: unknown[]) => {
        mockUpdateWhereCalls.push(args);
        const rows = mockUpdateReturnQueue.length ? mockUpdateReturnQueue.shift()!() : [];
        return { returning: () => thenable(rows) };
      },
    }),
  });

  const makeInsert = () => () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertValues.push(vals);
      return { returning: () => thenable([{ id: "req-generated-uuid", ...vals }]) };
    },
  });

  return {
    db: {
      select: makeSelect2(),
      update: makeUpdate(),
      insert: makeInsert(),
      transaction: jest.fn(async (fn: any) => fn({
        select: makeSelect2(),
        update: makeUpdate(),
        insert: makeInsert(),
      })),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  requireAnyRole:
    (_roles: string[]) =>
    async () => ({ supabaseUser: {}, dbUser: mockAuthUser }),
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireShopMember: jest.fn(() => async () => ({
    supabaseUser: {},
    dbUser: { id: "db-staff-1", role: "rider" },
    membership: {},
  })),
}));

jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
  sendNotifications: jest.fn(async () => undefined),
}));

jest.mock("@/lib/wsNotify", () => ({ notifyWs: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sendNotification } from "@/lib/notify";
import { notifyWs } from "@/lib/wsNotify";

function req(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const validBody = {
  service_id: serviceId,
  requested_date: tomorrow,
  window_start: "10:00",
  window_end: "12:00",
  vehicle_details: "Toyota Axio, white, DHK-METRO-1234",
};

beforeEach(() => {
  mockSelectQueue = [];
  mockUpdateReturnQueue = [];
  mockUpdateWhereCalls = [];
  mockInsertValues = [];
  mockAuthUser = { id: customerId, role: "rider" };
  (sendNotification as jest.Mock).mockClear();
  (notifyWs as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// F-13 — POST /api/shop/[id]/workshop/requests (customer creates a request)
// ══════════════════════════════════════════════════════════════════════
describe("F-13 — customer service request create", () => {
  it("creates the request with the window + vehicle details and pings the shop inbox", async () => {
    mockSelectQueue = [
      () => [{ id: shopId }], // shop lookup
      () => [{ id: serviceId }], // service lookup (shop-scoped, live)
    ];

    const res = await wreqCreate(req(validBody), { id: shopId });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.request_id).toBe("req-generated-uuid");
    expect(json.message).toContain("2h");

    expect(mockInsertValues).toHaveLength(1);
    expect(mockInsertValues[0]).toMatchObject({
      shop_id: shopId,
      service_id: serviceId,
      customer_user_id: customerId,
      requested_date: tomorrow,
      window_start: "10:00",
      window_end: "12:00",
      vehicle_details: validBody.vehicle_details,
    });
    expect(notifyWs).toHaveBeenCalledTimes(1);
  });

  it("past date → 400 invalid_date before any DB access", async () => {
    mockSelectQueue = [() => [{ id: shopId }], () => [{ id: serviceId }]];

    const res = await wreqCreate(
      req({ ...validBody, requested_date: "2020-01-01" }),
      { id: shopId },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_date");
    expect(mockSelectQueue).toHaveLength(2); // untouched
    expect(mockInsertValues).toHaveLength(0);
  });

  it("inverted window (end <= start) → 400 from the Zod contract", async () => {
    const res = await wreqCreate(
      req({ ...validBody, window_start: "12:00", window_end: "10:00" }),
      { id: shopId },
    );
    expect(res.status).toBe(400);
    expect(mockInsertValues).toHaveLength(0);
  });

  it("unknown shop → 404, no insert", async () => {
    mockSelectQueue = [() => []]; // shop lookup misses

    const res = await wreqCreate(req(validBody), { id: shopId });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("shop_not_found");
    expect(mockInsertValues).toHaveLength(0);
  });

  it("service from ANOTHER shop (or deleted) → 404, no insert", async () => {
    mockSelectQueue = [() => [{ id: shopId }], () => []]; // service lookup misses

    const res = await wreqCreate(req(validBody), { id: shopId });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("service_not_found");
    expect(mockInsertValues).toHaveLength(0);
  });

  it("invalid UUID shop id → 400 before any DB access", async () => {
    const res = await wreqCreate(req(validBody), { id: "nope" });
    expect(res.status).toBe(400);
    expect(mockInsertValues).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// F-13/F-29 — applyWorkshopSla (2h AUTO-DECLINE)
// ══════════════════════════════════════════════════════════════════════
describe("F-13 — 2h SLA auto-decline sweep", () => {
  it("flips expired rows and sends ONE keyed high-priority push per declined row", async () => {
    mockUpdateReturnQueue = [
      () => [
        { id: "req-1", customer_user_id: customerId, shop_id: shopId },
        { id: "req-2", customer_user_id: customerId, shop_id: shopId },
      ],
    ];

    const declined = await applyWorkshopSla({ shopId });
    expect(declined).toHaveLength(2);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    for (const [userId, type, , , data, options] of (sendNotification as jest.Mock).mock.calls) {
      expect(userId).toBe(customerId);
      expect(type).toBe("workshop:request_declined");
      expect(options.priority).toBe("high");
      expect(options.idempotencyKey.startsWith("workshop_declined:")).toBe(true);
      expect(["req-1", "req-2"]).toContain(data.request_id);
    }

    // Sweep predicate: requested + cutoff + scope bound into the WHERE.
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(mockUpdateWhereCalls[0][0]);
    expect(rendered.params).toEqual(expect.arrayContaining(["requested", shopId]));
  });

  it("no expired rows → no notification, empty result", async () => {
    mockUpdateReturnQueue = [() => []];

    const declined = await applyWorkshopSla({});
    expect(declined).toHaveLength(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("customer scope binds the caller's id into the sweep", async () => {
    mockUpdateReturnQueue = [() => []];

    await applyWorkshopSla({ customerId });

    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(mockUpdateWhereCalls[0][0]);
    expect(rendered.params).toEqual(expect.arrayContaining(["requested", customerId]));
  });
});

// ══════════════════════════════════════════════════════════════════════
// F-13 — GET /api/workshop/requests (customer list, SLA enforced first)
// ══════════════════════════════════════════════════════════════════════
describe("F-13 — customer my-requests list", () => {
  it("sweeps the SLA before reading, then returns the caller's rows", async () => {
    // Queue order: (1) SLA sweep UPDATE returning [], (2) the list SELECT.
    mockUpdateReturnQueue = [() => []];
    mockSelectQueue = [
      () => [
        { id: "req-1", status: "requested", shop_name: "Auto Fix" },
        { id: "req-2", status: "declined", shop_name: "Auto Fix" },
      ],
    ];

    const res = await myRequestsGet(
      new Request("http://localhost/api/workshop/requests"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requests).toHaveLength(2);

    // The sweep ran (its WHERE was recorded) with the customer scope.
    expect(mockUpdateWhereCalls).toHaveLength(1);
    const { PgDialect } = require("drizzle-orm/pg-core");
    const sweep = new PgDialect().sqlToQuery(mockUpdateWhereCalls[0][0]);
    expect(sweep.params).toEqual(expect.arrayContaining(["requested", customerId]));
  });

  it("shop_id filter must be a UUID → 400", async () => {
    const res = await myRequestsGet(
      new Request("http://localhost/api/workshop/requests?shop_id=nope"),
    );
    expect(res.status).toBe(400);
    expect(mockSelectQueue).toHaveLength(0);
  });
});
