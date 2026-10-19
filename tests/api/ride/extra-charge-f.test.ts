/**
 * F — ride extra-charge loop closure.
 *
 *   - POST double-submit guard: an identical PENDING proposal (same ride,
 *     type, amount, note) 409s instead of minting a second charge the rider
 *     could approve twice into the fare. A genuinely second charge
 *     (different amount or note) still passes.
 *   - PATCH approve/dispute notifies the PROPOSING driver (push + WS,
 *     after the commit, exactly once — retries 409 on the claim first).
 */
import { jest } from "@jest/globals";

// SUT imports above the mock block (babel hoisting keeps this runtime-safe).
import { POST as extraPost, PATCH as extraPatch } from "@/app/api/ride/[id]/extra-charge+api";

let mockSelectQueue: (() => unknown[])[];
let mockInsertCalls: unknown[];
let mockSent: { userId: string; type: string; title: string }[];
let mockWsEvents: { event: string; to: { user_id: string }[] }[];
let mockSupabaseUid: string | null;

function mockChainable(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.where = jest.fn(self);
  c.limit = jest.fn(self);
  c.orderBy = jest.fn(self);
  c.returning = jest.fn(async () => rows);
  c.then = (resolve: (v: unknown) => unknown) => resolve(rows);
  return c;
}

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => {
        const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
        return mockChainable(rows);
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: "charge-1" }]) })),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((vals: unknown) => {
        mockInsertCalls.push(vals);
        return { returning: jest.fn(async () => [{ id: "charge-1" }]) };
      }),
    })),
    transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: "charge-1" }]) })),
          })),
        })),
        insert: jest.fn(() => ({
          values: jest.fn((vals: unknown) => {
            mockInsertCalls.push(vals);
            return { returning: jest.fn(async () => [{ id: "ticket-1" }]) };
          }),
        })),
      }),
    ),
  },
}));

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => {
    if (!mockSupabaseUid) throw Object.assign(new Error("unauthorized"), { status: 401 });
    return { id: mockSupabaseUid };
  }),
  requireRole: jest.fn(() => async () => ({ id: "db-user-1" })),
}));

jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(
    async (userId: string, type: string, title: string, _body: string) => {
      mockSent.push({ userId, type, title });
      return { sent: 1, failed: 0 };
    },
  ),
  sendNotifications: jest.fn(async () => []),
}));

jest.mock("@/lib/wsNotify", () => ({
  notifyWs: jest.fn((events: { event: string; to: { user_id: string }[] }[]) => {
    mockWsEvents.push(...events);
  }),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const RIDE = "00000000-0000-4000-8000-0000000000e1";
const CHARGE = "00000000-0000-4000-8000-0000000000e2";

function jsonReq(method: string, body: unknown) {
  return new Request(`http://test/api/ride/${RIDE}/extra-charge`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSelectQueue = [];
  mockInsertCalls = [];
  mockSent = [];
  mockWsEvents = [];
  mockSupabaseUid = "sup-1";
});

describe("POST duplicate-pending guard", () => {
  // users → drivers → ride(active, owned) → dupe probe → insert.
  function queuePropose(dupe: unknown[]) {
    mockSelectQueue.push(() => [{ id: "db-user-1" }]); // users
    mockSelectQueue.push(() => [{ id: "driver-1" }]); // drivers
    mockSelectQueue.push(() => [
      { id: RIDE, driver_id: "driver-1", user_id: "rider-1", status: "in_progress" },
    ]);
    mockSelectQueue.push(() => dupe); // pending-dupe probe
  }

  const toll = { type: "toll", amount_bdt: 5000, description: "Padma toll" };

  it("identical pending proposal 409s — no second charge minted", async () => {
    queuePropose([{ id: "charge-old" }]);
    const res = await extraPost(jsonReq("POST", toll), { id: RIDE });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "duplicate_pending_charge" });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("a second charge with a different amount still passes", async () => {
    queuePropose([]);
    const res = await extraPost(jsonReq("POST", { ...toll, amount_bdt: 7000 }), {
      id: RIDE,
    });
    expect(res.status).toBe(200);
    expect(mockInsertCalls).toHaveLength(1);
  });

  it("a second charge with a distinguishing note still passes", async () => {
    // An identical AMOUNT with no note on file is not "identical" to this
    // noted one — the probe misses, the insert runs.
    queuePropose([]);
    const res = await extraPost(jsonReq("POST", { ...toll, description: "2nd toll" }), {
      id: RIDE,
    });
    expect(res.status).toBe(200);
    expect(mockInsertCalls).toHaveLength(1);
  });
});

describe("PATCH resolution notifies the driver", () => {
  // users → charge → ride(with driver) → tx claim → driver user lookup.
  function queueResolve() {
    mockSelectQueue.push(() => [{ id: "db-user-1" }]); // users by auth_uid
    mockSelectQueue.push(() => [
      { id: CHARGE, ride_id: RIDE, type: "toll", amount_bdt: 5000, status: "pending" },
    ]);
    mockSelectQueue.push(() => [
      { user_id: "db-user-1", driver_id: "driver-1", status: "in_progress" },
    ]);
    mockSelectQueue.push(() => [{ user_id: "driver-user-9" }]); // drivers → user
  }

  it("approve pushes + WS-events the driver exactly once", async () => {
    queueResolve();
    const res = await extraPatch(jsonReq("PATCH", { charge_id: CHARGE, action: "approve" }), {
      id: RIDE,
    });
    expect(res.status).toBe(200);
    expect(mockSent).toHaveLength(1);
    expect(mockSent[0]).toMatchObject({
      userId: "driver-user-9",
      type: "ride:extra_charge_resolved",
      title: "Charge approved",
    });
    expect(mockWsEvents).toHaveLength(1);
    expect(mockWsEvents[0]).toMatchObject({ event: "ride:extra_charge_resolved" });
    expect(mockWsEvents[0].to[0].user_id).toBe("driver-user-9");
  });

  it("dispute notifies the driver with the dispute copy", async () => {
    queueResolve();
    const res = await extraPatch(jsonReq("PATCH", { charge_id: CHARGE, action: "dispute" }), {
      id: RIDE,
    });
    expect(res.status).toBe(200);
    expect(mockSent).toHaveLength(1);
    expect(mockSent[0]).toMatchObject({
      userId: "driver-user-9",
      type: "ride:extra_charge_resolved",
      title: "Charge disputed",
    });
  });
});
