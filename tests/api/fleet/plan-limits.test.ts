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
 * Batch-2 Item 10 added a read ahead of the plan lookup: the governing plan is
 * the one the fleet HOLDS (operator_packages, role='fleet'); the legacy
 * fleets.subscription_plan_id pointer is the fallback. Every legacy case below
 * therefore also queues an empty possession result, and the last two cases pin
 * which id the plan lookup actually uses.
 *
 * Only the DB layer is mocked. The checkLimit function is the SUT.
 */

import { PgDialect } from "drizzle-orm/pg-core";
import { checkVehicleLimit, checkDriverLimit } from "@/lib/fleetLimits";

const mockSelectQueue: (() => unknown[])[] = [];
/** Every `.where(cond)` the SUT built, in call order — used to prove WHICH plan
 * id the limit lookup asked for. */
const whereConditions: unknown[] = [];

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
  chain.where = jest.fn().mockImplementation((cond: unknown) => {
    whereConditions.push(cond);
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
    whereConditions.length = 0;
  });

  it("no subscription plan → ok (open access)", async () => {
    // Query 1: fleet.subscription_plan_id → null
    pushSelectRows([{ subscription_plan_id: null }]);
    pushSelectRows([]); // Query 2: no fleet possession

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
  });

  it("plan with NULL vehicle_limit → ok (unlimited)", async () => {
    // Query 1: fleet.subscription_plan_id → PLAN_ID
    // Query 2: plan.vehicle_limit → null
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([]); // possession: none — the legacy pointer governs
    pushSelectRows([{ vehicle_limit: null, driver_limit: null, name: "Basic" }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
  });

  it("under vehicle limit → ok with current/limit info", async () => {
    // Query 1: fleet → PLAN_ID
    // Query 2: plan → vehicle_limit: 5
    // Query 3: count(*) → 3
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([]); // possession: none — the legacy pointer governs
    pushSelectRows([{ vehicle_limit: 5, driver_limit: null, name: "Pro" }]);
    pushSelectRows([{ count: 3 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
    expect(result.current).toBe(3);
    expect(result.limit).toBe(5);
  });

  it("at vehicle limit → fail with plan_limit_exceeded", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([]); // possession: none — the legacy pointer governs
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
    pushSelectRows([]); // possession: none — the legacy pointer governs
    pushSelectRows([{ vehicle_limit: 2, driver_limit: null, name: "Starter" }]);
    pushSelectRows([{ count: 5 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plan_limit_exceeded");
  });

  it("under driver limit → ok", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([]); // possession: none — the legacy pointer governs
    pushSelectRows([{ vehicle_limit: null, driver_limit: 10, name: "Fleet Pro" }]);
    pushSelectRows([{ count: 4 }]);

    const result = await checkDriverLimit(FLEET_ID);
    expect(result.ok).toBe(true);
    expect(result.current).toBe(4);
    expect(result.limit).toBe(10);
  });

  it("at driver limit → fail", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([]); // possession: none — the legacy pointer governs
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
    pushSelectRows([]); // possession: none — the legacy pointer governs
    pushSelectRows([]); // plan doesn't exist

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
  });

  it("DB error → fail open (ok=true)", async () => {
    // One-shot throw: a permanent override (spyOn + mockImplementation) would
    // survive clearAllMocks and poison every later case in this file.
    (require("@/src/db").db.select as jest.Mock).mockImplementationOnce(() => {
      throw new Error("DB connection lost");
    });

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true); // fail open
  });
});

describe("fleet plan-limit enforcement after the fold-in (Batch-2 Item 10)", () => {
  const HELD_PACKAGE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectQueue.length = 0;
    whereConditions.length = 0;
  });

  it("the HELD package governs — a stale legacy pointer cannot cap an upgrade", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]); // legacy pointer (old plan)
    pushSelectRows([
      { package_id: HELD_PACKAGE_ID, status: "active", expires_at: null },
    ]); // possession (the package the fleet bought)
    pushSelectRows([{ vehicle_limit: 10, driver_limit: null, name: "Fleet Pro" }]);
    pushSelectRows([{ count: 3 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(true);
    expect(result.limit).toBe(10);

    // Query 3 (the plan lookup, after fleet + possession) asked for the HELD
    // package id — the plan id and the package id are the same value post-fold.
    const planQuery = new PgDialect().sqlToQuery(whereConditions[2] as never);
    expect(planQuery.params).toContain(HELD_PACKAGE_ID);
    expect(planQuery.params).not.toContain(PLAN_ID);
  });

  it("an EXPIRED possession falls back to the legacy pointer (nobody is silently unlimited)", async () => {
    pushSelectRows([{ subscription_plan_id: PLAN_ID }]);
    pushSelectRows([
      { package_id: HELD_PACKAGE_ID, status: "active", expires_at: new Date(Date.now() - 60_000) },
    ]);
    pushSelectRows([{ vehicle_limit: 4, driver_limit: null, name: "Fleet Basic" }]);
    pushSelectRows([{ count: 4 }]);

    const result = await checkVehicleLimit(FLEET_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plan_limit_exceeded");

    const planQuery = new PgDialect().sqlToQuery(whereConditions[2] as never);
    expect(planQuery.params).toContain(PLAN_ID);
  });
});
