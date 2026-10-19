/**
 * P0-6 (gap ledger): dispatch candidate-pool SQL predicate assertions.
 *
 * The existing pool tests (dispatch-min-per-km.test.ts, dispatch-blocklist
 * .test.ts) run buildCandidateList against a rows-in/rows-out db mock, which
 * proves the JS filters but NOT the SQL WHERE predicates. A driver who is
 * offline, suspended, or mid-ride must never enter the pool AT SQL LEVEL —
 * the filters live in dispatch.ts:198-217 and were never asserted.
 *
 * This suite captures the drizzle predicate object passed to `.where()` for
 * the driverRows query and SQL-ifies it via PgDialect, asserting:
 *  - is_online = true        (AGENTS.md pool invariant — offline never in pool)
 *  - status = 'active'       (suspended/rejected never in pool)
 *  - NOT EXISTS busy-ride subquery covering EVERY in-ride status
 *    (matched, driver_arriving, driver_arrived, in_progress) — the guard that
 *    makes the auth:hello reconnect re-online write non-exploitable.
 */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), execute: jest.fn() },
}));
jest.mock("../h3Index", () => ({
  getDriversInCells: jest.fn(),
  getIndexedDriverCount: jest.fn(() => 0),
}));
jest.mock("../../lib/h3", () => ({
  getH3Ring: jest.fn(() => ["cell1", "cell2"]),
}));
jest.mock("../../lib/vehicleTypes", () => ({
  checkDriverEligibility: jest.fn(() => ({ eligible: true })),
}));
jest.mock("../../lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async () => ({})),
  parseConfigNumber: jest.fn((_v: string, fallback: number) => fallback),
  parseConfigBool: jest.fn(() => false),
}));
jest.mock("../coldDrop", () => ({
  getColdDropInfos: jest.fn(async () => new Map()),
  recordColdDrop: jest.fn(),
  clearColdDropCache: jest.fn(),
  getColdDropBoost: jest.fn(async () => 1),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "../../src/db";
import { drivers, pricing, rides } from "../../src/db/schema";
import { getDriversInCells } from "../h3Index";
import { buildCandidateList } from "../dispatch";

const BY_TABLE = new Map<unknown, Array<Record<string, unknown>>>();

/** Predicate captured from the from(drivers) query's .where() call. */
let driverWherePredicate: SQL | undefined;
/** Predicates captured from from(rides) queries' .where() calls. */
let rideWherePredicates: SQL[] = [];

beforeEach(() => {
  BY_TABLE.clear();
  driverWherePredicate = undefined;
  rideWherePredicates = [];
  jest.clearAllMocks();

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      const rows = () => BY_TABLE.get(table) ?? [];
      const chain: any = {
        leftJoin: jest.fn(() => chain),
        where: jest.fn((predicate: SQL) => {
          if (table === drivers) driverWherePredicate = predicate;
          if (table === rides) rideWherePredicates.push(predicate);
          return {
            limit: jest.fn(async (n: number) => rows().slice(0, n)),
            groupBy: jest.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(rows()),
            })),
            then: (resolve: (v: unknown) => void) => resolve(rows()),
          };
        }),
      };
      return chain;
    }),
  }));

  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn(() => ({ onConflictDoNothing: jest.fn(async () => []) })),
  }));
  (db.execute as jest.Mock).mockResolvedValue([]);

  BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
  BY_TABLE.set(drivers, []);
});

function capturedPredicateSql(): { sql: string; params: unknown[] } {
  expect(driverWherePredicate).toBeDefined();
  const dialect = new PgDialect();
  const rendered = dialect.sqlToQuery(driverWherePredicate as SQL);
  return { sql: rendered.sql, params: rendered.params as unknown[] };
}

function capturedRidePredicateSql(): string[] {
  const dialect = new PgDialect();
  return rideWherePredicates.map((predicate) => dialect.sqlToQuery(predicate).sql);
}

describe("candidate-pool WHERE predicate — dispatch.ts:198-217", () => {
  test("pool query filters at SQL level: is_online = true", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const { sql, params } = capturedPredicateSql();
    expect(sql).toContain('"drivers"."is_online" = $');
    expect(params).toContain(true);
  });

  test("pool query filters at SQL level: status = 'active'", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const { sql, params } = capturedPredicateSql();
    expect(sql).toContain('"drivers"."status" = $');
    expect(params).toContain("active");
  });

  test("pool query filters at SQL level: on_break = false (C4-2 — break is not offline)", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const { sql, params } = capturedPredicateSql();
    // Removing this predicate flips the test red — an on-break driver would
    // re-enter the pool while the break-mode copy promises no requests.
    expect(sql).toContain('"drivers"."on_break" = $');
    expect(params).toContain(false);
  });

  test("pool query filters at SQL level: vehicle_type gate precedes scoring", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "car_economy", "z", []);

    const { sql, params } = capturedPredicateSql();
    expect(sql).toContain('"drivers"."vehicle_type" = $');
    expect(params).toContain("car_economy");
  });

  test("pool query excludes busy drivers via NOT EXISTS over EVERY in-ride status", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const { sql } = capturedPredicateSql();
    expect(sql).toContain("NOT EXISTS");
    // The busy-status set must be exhaustive — a missing future status would
    // re-offer en-route drivers (double-ride failure, dispatch.ts:204-210).
    expect(sql).toContain("IN ('matched', 'driver_arriving', 'driver_arrived', 'in_progress')");
    // Subquery rides must be bounded to recent rides (stale-ride guard).
    expect(sql).toContain("interval '3 hours'");
  });

  test("pool query restricts to the H3 candidate id set (inArray)", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1", "d2"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const { sql } = capturedPredicateSql();
    expect(sql).toContain('"drivers"."id" in (');
  });

  test("vehicle-document expiry uses the Bangladesh calendar day, not server CURRENT_DATE", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const { sql } = capturedPredicateSql();
    expect(sql).toContain("(now() AT TIME ZONE 'Asia/Dhaka')::date");
    expect(sql).not.toContain("CURRENT_DATE");
  });

  test("daily quality boundary converts ride timestamps to the Bangladesh calendar day", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
    BY_TABLE.set(drivers, [{ id: "d1" }]);
    await buildCandidateList("ride-p", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

    const qualitySql = capturedRidePredicateSql().find((query) =>
      query.includes('"rides"."status" in ('),
    );
    expect(qualitySql).toBeDefined();
    expect(qualitySql).toContain("AT TIME ZONE 'Asia/Dhaka'");
    expect(qualitySql).toContain("(now() AT TIME ZONE 'Asia/Dhaka')::date");
    expect(qualitySql).not.toContain("CURRENT_DATE");
  });
});
