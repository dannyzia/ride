/**
 * P0-1 (gap ledger): dispatch pool blocklist + commute filters —
 * utils-server/dispatch.ts batched pre-fetch (§348-391) and the per-candidate
 * filters in the scoring loop. Asserts:
 *  - a rider-blocked driver is excluded from the candidate list
 *  - a driver whose active commute destination deviates beyond
 *    max_deviation_meters from the ride destination is excluded
 *  - a fetch failure in the commute/blocklist query FAILS OPEN (drivers stay
 *    eligible — documented fail-open semantics, not correctness gates)
 *  - Phase D write ownership: filtering never inserts dispatch_offers rows
 *
 * DB and H3 index are mocked per the dispatch-min-per-km.test.ts pattern
 * (rows keyed by real schema-table identity).
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
  rides,
  driverCommutePreferences,
  driverBlocklists,
} from "../../src/db/schema";
import { getDriversInCells } from "../h3Index";
import { buildCandidateList } from "../dispatch";

const BY_TABLE = new Map<unknown, Array<Record<string, unknown>>>();
const THROW_ON_TABLE = new Set<unknown>();

beforeEach(() => {
  BY_TABLE.clear();
  THROW_ON_TABLE.clear();
  jest.clearAllMocks();

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      if (THROW_ON_TABLE.has(table)) {
        throw new Error("db unavailable (simulated)");
      }
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

// Ride owner row — returned for the ride-owner lookup (limit(1)); the
// quality/cooldown group-by queries over `rides` receive the same row and
// skip it (no driver_id).
const OWNER_ROW = { user_id: "rider-owner", female_driver_preference: false };

const RIDE_ID = "ride-blk";
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

function seedCommon(driverRows: Array<Record<string, unknown>>) {
  BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
  BY_TABLE.set(drivers, driverRows);
  BY_TABLE.set(rides, [OWNER_ROW]);
  BY_TABLE.set(driverCommutePreferences, []);
  BY_TABLE.set(driverBlocklists, []);
}

describe("buildCandidateList — blocklist filter", () => {
  test("rider-blocked driver is excluded; unblocked peer is offered", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d-blocked", "d-clean"]);
    seedCommon([
      { ...DRIVER_BASE, id: "d-blocked" },
      { ...DRIVER_BASE, id: "d-clean" },
    ]);
    BY_TABLE.set(driverBlocklists, [{ driver_id: "d-blocked" }]);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toEqual(["d-clean"]);
  });

  test("Phase D: blocklist filtering writes NO dispatch_offers row", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d-blocked"]);
    seedCommon([{ ...DRIVER_BASE, id: "d-blocked" }]);
    BY_TABLE.set(driverBlocklists, [{ driver_id: "d-blocked" }]);

    const scored = await run();
    expect(scored).toHaveLength(0);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("buildCandidateList — commute filter", () => {
  test("driver whose commute deviates beyond max_deviation_meters is filtered", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d-far", "d-close"]);
    seedCommon([
      { ...DRIVER_BASE, id: "d-far" },
      { ...DRIVER_BASE, id: "d-close" },
    ]);
    BY_TABLE.set(driverCommutePreferences, [
      {
        driver_id: "d-close",
        active: true,
        destination_lat: String(DEST.lat),
        destination_lng: String(DEST.lng),
        max_deviation_meters: 2000,
      },
      {
        driver_id: "d-far",
        active: true,
        // ~25 km from the ride destination
        destination_lat: "24.0",
        destination_lng: "90.6",
        max_deviation_meters: 2000,
      },
    ]);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toEqual(["d-close"]);
  });

  test("inactive commute preference row does not filter (SQL pre-filters active; JS map only holds fetched rows)", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d-far"]);
    seedCommon([{ ...DRIVER_BASE, id: "d-far" }]);
    BY_TABLE.set(driverCommutePreferences, []);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toEqual(["d-far"]);
  });
});

describe("buildCandidateList — commute/blocklist fetch fails OPEN", () => {
  test("blocklist fetch failure keeps blocked driver eligible (fail-open, no throw)", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d-blocked"]);
    seedCommon([{ ...DRIVER_BASE, id: "d-blocked" }]);
    BY_TABLE.set(driverBlocklists, [{ driver_id: "d-blocked" }]);
    THROW_ON_TABLE.add(driverBlocklists);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toEqual(["d-blocked"]);
  });

  test("commute fetch failure keeps off-commute driver eligible (fail-open, no throw)", async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(["d-far"]);
    seedCommon([{ ...DRIVER_BASE, id: "d-far" }]);
    BY_TABLE.set(driverCommutePreferences, [
      {
        driver_id: "d-far",
        active: true,
        destination_lat: "24.0",
        destination_lng: "90.6",
        max_deviation_meters: 2000,
      },
    ]);
    THROW_ON_TABLE.add(driverCommutePreferences);

    const scored = await run();
    expect(scored.map((s) => s.driverId)).toEqual(["d-far"]);
  });
});
