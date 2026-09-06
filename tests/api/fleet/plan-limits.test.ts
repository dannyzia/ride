/**
 * Integration tests for fleet plan-limit enforcement (lib/fleetLimits.ts).
 *
 * Verifies that checkVehicleLimit and checkDriverLimit correctly:
 * - Return ok=true when no subscription exists (open access)
 * - Return ok=true when plan has NULL limit (unlimited)
 * - Return ok=true when usage is under the limit
 * - Return ok=false with error code when usage >= limit
 * - Fail open on DB errors (don't block operations)
 *
 * Only the DB layer is mocked. The checkLimit function is the SUT.
 */

import { checkVehicleLimit, checkDriverLimit } from "@/lib/fleetLimits";

const mockSelectQueue: (() => unknown[])[] = [];

function mockSelectChain(rows: unknown[]) {
  // Drizzle chains: select().from().where().limit(N)
  // We need the chain to be `await`able at the terminal call.
  // Approach: every method returns the same chain, but `where` and `limit`
  // attach a `.then` so `await` resolves with `rows`.
  const chain: Record<string, unknown> = { _rows: rows };

  const makeThenable = (target: Record<string, unknown>) => {
    target.then = (resolve: (v: unknown) => unknown) => resolve(target._rows);
    target.catch = () => ({ then: (r: (v: unknown) => unknown) => r(target._rows) });
    return target;
  };

  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.groupBy = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);

  // where() — terminal for count queries, intermediate for limit queries
  chain.where = jest.fn().mockImplementation(() => {
    return makeThenable({ ...chain });
  });

  // limit() — terminal for single-row queries
  chain.limit = jest.fn().mockImplementation(() => {
    return makeThenable({ ...chain });
  });

  return chain;
}

function mockNextSelect() {
  const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
  return mockSelectChain(rows);
}

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(() => mockNextSelect()),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const FLEET_ID = "11111111-1111-1111-1111-111111111111";
const PLAN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function pushSelectRows(...rows: unknown[][]) {
  for (const r of rows) mockSelectQueue.push(() => r);
}

describe("fleet plan-limit enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectQueue.length = 0;
  });

  it("no subscription plan → ok (open access)", async () => {
    // Query 1: fleet.subscription_plan_id → null
    pushSelectRows([{ subscription_plan_id: null }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
  });

  it("plan with NULL vehicle_limit → ok (unlimited)", async () => {
    // Query 1: fleet.subscription_plan_id → PLAN_ID
    // Query 2: plan.vehicle_limit → null
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([{ vehicle_limit: null, driver_limit: null, name: "Basic" }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
  });

  it("under vehicle limit → ok with current/limit info", async () => {
    // Query 1: fleet → PLAN_ID
    // Query 2: plan → vehicle_limit: 5
    // Query 3: count(*) → 3
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([{ vehicle_limit: 5, driver_limit: null, name: "Pro" }]);
    pushSelectRows([{ count: 3 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
    expect(result.current).toBe(3);
    expect(result.limit).toBe(5);
  });

  it("at vehicle limit → fail with plan_limit_exceeded", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([{ vehicle_limit: 3, driver_limit: null, name: "Basic" }]);
    pushSelectRows([{ count: 3 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plan_limit_exceeded");
    expect(result.current).toBe(3);
    expect(result.limit).toBe(3);
    expect(result.message).toContain("Vehicles limit reached");
    expect(result.message).toContain("3/3");
  });

  it("over vehicle limit (edge: more vehicles than limit) → fail", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([{ vehicle_limit: 2, driver_limit: null, name: "Starter" }]);
    pushSelectRows([{ count: 5 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plan_limit_exceeded");
  });

  it("under driver limit → ok", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([{ vehicle_limit: null, driver_limit: 10, name: "Fleet Pro" }]);
    pushSelectRows([{ count: 4 }]);

    const result = await checkDriverLimit(FLEET_ID);
    expect(result.ok).toBe(true);
    expect(result.current).toBe(4);
    expect(result.limit).toBe(10);
  });

  it("at driver limit → fail", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([{ vehicle_limit: null, driver_limit: 5, name: "Fleet" }]);
    pushSelectRows([{ count: 5 }]);

    const result = await checkDriverLimit(FLEET_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plan_limit_exceeded");
    expect(result.message).toContain("Drivers limit reached");
    expect(result.message).toContain("5/5");
  });

  it("fleet not found → error", async () => {
    pushSelectRows([]); // no fleet row

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("fleet_not_found");
  });

  it("plan not found (deleted) → ok (fail open)", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([]); // plan doesn't exist

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
  });

  it("DB error → fail open (ok=true)", async () => {
    jest
      .spyOn(require("@/src/db").db, "select")
      .mockImplementation(() => {
        throw new Error("DB connection lost");
      });

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true); // fail open
  });
});
