/**
 * dispatch_offers candidate-pool invariants (AGENTS.md Dispatch invariants):
 *  - drivers with min_per_km_bdt above the system rate are never offered
 *  - Phase D: dispatch.ts NO LONGER WRITES dispatch_offers (no 'filtered'
 *    audit rows) — filtered drivers are simply absent from the return list
 *  - drivers already offered for this ride are excluded (chain exclusion)
 *  - exhausted drivers (calls_remaining = 0) are never in the candidate pool
 *
 * The DB and H3 index are mocked. dispatch.ts imports resolve to root modules
 * (`../src/db` → root src/db, `../lib/h3` → root lib/h3), so the mocks below
 * target those root modules.
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
  getFareFrameworkConfig: jest.fn(async () => ({
    new_driver_priority_days: "7",
    new_driver_priority_leads: "0",
    return_lead_affinity_multiplier: "1.1",
  })),
  parseConfigNumber: jest.fn((_v: string, fallback: number) => fallback),
  parseConfigBool: jest.fn(() => false),
}));
jest.mock("../coldDrop", () => ({
  getColdDropInfos: jest.fn(async () => new Map()),
  recordColdDrop: jest.fn(),
  clearColdDropCache: jest.fn(),
  getColdDropBoost: jest.fn(async () => 1),
}));

import { db } from "../../src/db";
import {
  drivers,
  pricing,
  dispatchOffers,
} from "../../src/db/schema";
import { getDriversInCells } from "../h3Index";
import { buildCandidateList } from "../dispatch";

// Responses keyed by table identity (the real schema objects), so the mock is
// robust to query ordering inside buildCandidateList.
const BY_TABLE = new Map<unknown, Array<Record<string, unknown>>>();

beforeEach(() => {
  BY_TABLE.clear();
  jest.clearAllMocks();

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      const rows = () => BY_TABLE.get(table) ?? [];
      const chain: any = {
        leftJoin: jest.fn(() => chain),
        where: jest.fn(() => {
          const result = rows();
          return {
            limit: jest.fn(async (n: number) => result.slice(0, n)),
            groupBy: jest.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(result),
            })),
            then: (resolve: (v: unknown) => void) => resolve(result),
          };
        }),
      };
      return chain;
    }),
  }));

  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn(() => ({
      onConflictDoNothing: jest.fn(async () => []),
    })),
  }));

  (db.execute as jest.Mock).mockResolvedValue([]);
});

const DRIVER_BASE: Record<string, unknown> = {
  id: "driver-1",
  last_location_lat: "23.8103",
  last_location_lng: "90.4125",
  rating: "4.5",
  acceptance_rate: "90.00",
  last_location_at: new Date(),
  completed_rides_count: 20,
  min_per_km_bdt: null,
  vehicle_type: "bike_basic",
  gender: "male",
  auto_accept_enabled: false,
  auto_accept_radius_meters: null,
  subscription_id: "sub-1",
  calls_remaining: 5,
  daily_calls_used: 0,
  daily_cap: 50,
};

const RIDE_ID = "ride-abc";
const ZONE_ID = "zone-xyz";
const ORIGIN = { lat: 23.8103, lng: 90.4125 };
const DEST = { lat: 23.8203, lng: 90.4225 };

function run() {
  return buildCandidateList(
    RIDE_ID,
    ORIGIN.lat,
    ORIGIN.lng,
    DEST.lat,
    DEST.lng,
    "bike_basic",
    ZONE_ID,
    [],
  );
}

describe("buildCandidateList — min_per_km_bdt filter", () => {
  test("driver with null min_per_km_bdt is offered", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-1"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [{ ...DRIVER_BASE }]);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toContain("driver-1");
  });

  test("driver with min_per_km_bdt above the system rate is filtered out", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-2"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [
      { ...DRIVER_BASE, id: "driver-2", min_per_km_bdt: 1200 },
    ]);

    const scored = await run();
    expect(scored).toHaveLength(0);
  });

  test("driver with min_per_km_bdt above the system rate is filtered out — and Phase D writes NO dispatch_offers row", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-2"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [
      { ...DRIVER_BASE, id: "driver-2", min_per_km_bdt: 1200 },
    ]);

    const scored = await run();
    expect(scored).toHaveLength(0);
    // Phase D write-ownership: dispatch.ts never writes dispatch_offers —
    // the min_per_km filter is a pure pool exclusion now.
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("driver with min_per_km_bdt at the system rate is NOT filtered", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-3"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [
      { ...DRIVER_BASE, id: "driver-3", min_per_km_bdt: 775 },
    ]);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toContain("driver-3");
  });

  test("system rate 0 (missing pricing row) disables the min filter — driver still offered", async () => {
    // The code only enforces min_per_km_bdt when there is a positive system
    // rate to compare against (systemPerKmBdt > 0). A missing pricing row
    // means no rate floor is in effect, so the driver is NOT filtered.
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-2"]);
    BY_TABLE.set(pricing, []);
    BY_TABLE.set(drivers, [
      { ...DRIVER_BASE, id: "driver-2", min_per_km_bdt: 650 },
    ]);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toContain("driver-2");
  });
});

describe("buildCandidateList — pool invariants", () => {
  test("driver already offered for this ride is excluded (batch exclusion)", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-1"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [{ ...DRIVER_BASE }]);
    BY_TABLE.set(dispatchOffers, [{ driver_id: "driver-1" }]);

    const scored = await run();
    expect(scored).toHaveLength(0);
  });

  test("exhausted driver (calls_remaining = 0) is never in the pool", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-4"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [
      { ...DRIVER_BASE, id: "driver-4", calls_remaining: 0 },
    ]);

    const scored = await run();
    expect(scored).toHaveLength(0);
  });

  test("daily-cap-exceeded driver is never in the pool", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["driver-5"]);
    BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
    BY_TABLE.set(drivers, [
      { ...DRIVER_BASE, id: "driver-5", daily_calls_used: 50, daily_cap: 50 },
    ]);

    const scored = await run();
    expect(scored).toHaveLength(0);
  });

  test("empty candidate list returns immediately without DB selects", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue([]);

    const scored = await run();
    expect(scored).toHaveLength(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
