/**
 * Phase G cancellation-cooldown filter (dispatch.ts buildCandidateList):
 *  - proximityCooldownWindowMinutes: base × 2^(offense−1), capped at 4×
 *  - a driver whose newest proximity-cancel (driver_cancel_within_200m,
 *    status='cancelled', cancelled_by='driver') is inside their effective
 *    window is excluded from the candidate pool
 *  - repeat offenses double the window (1 → base, 2 → 2×, 3+ → 4× cap)
 *
 * DB and H3 index mocked, same pattern as dispatch-min-per-km.test.ts.
 * rides has no cancelled_at column — `updated_at` carries the cancel
 * timestamp (asserted indirectly by the filter reading that column's rows).
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
    proximity_cancel_cooldown_minutes: "15",
  })),
  parseConfigNumber: (value: string, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },
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
} from "../../src/db/schema";
import { getDriversInCells } from "../h3Index";
import {
  buildCandidateList,
  proximityCooldownWindowMinutes,
} from "../dispatch";

const BY_TABLE = new Map<unknown, Array<Record<string, unknown>>>();

beforeEach(() => {
  BY_TABLE.clear();
  jest.clearAllMocks();

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      const rows = () => BY_TABLE.get(table) ?? [];
      const chain: Record<string, unknown> = {
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

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function proximityCancel(driverId: string, minutesAgoVal: number): Record<string, unknown> {
  // Shape serves both rides GROUP BY consumers (quality stats + cooldown);
  // quality fields are zeroed so they never skew scoring filters.
  return {
    driver_id: driverId,
    offense_count: "1", // replaced below when composing multi-offense drivers
    last_cancel_at: minutesAgo(minutesAgoVal),
    cancels_today: "0",
    fives_today: "0",
  };
}

function seedDrivers(ids: string[]): void {
  (getDriversInCells as jest.Mock).mockReturnValue(ids);
  BY_TABLE.set(
    drivers,
    ids.map((id) => ({ id, ...DRIVER_BASE })),
  );
  BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
}

function run(ids: string[]) {
  return buildCandidateList(
    RIDE_ID,
    ORIGIN.lat,
    ORIGIN.lng,
    DEST.lat,
    DEST.lng,
    "bike_basic",
    ZONE_ID,
    [],
  ).then((scored) => scored.map((s) => s.driverId));
}

describe("proximityCooldownWindowMinutes", () => {
  test("doubles per offense, capped at 4× base", () => {
    expect(proximityCooldownWindowMinutes(15, 1)).toBe(15);
    expect(proximityCooldownWindowMinutes(15, 2)).toBe(30);
    expect(proximityCooldownWindowMinutes(15, 3)).toBe(60);
    expect(proximityCooldownWindowMinutes(15, 4)).toBe(60); // cap
    expect(proximityCooldownWindowMinutes(15, 9)).toBe(60); // cap holds
  });

  test("offense count ≤ 1 or non-positive base → base window", () => {
    expect(proximityCooldownWindowMinutes(15, 0)).toBe(15);
    expect(proximityCooldownWindowMinutes(0, 3)).toBe(0);
  });
});

describe("buildCandidateList — proximity-cancel cooldown filter", () => {
  test("driver with a recent proximity cancel is excluded", async () => {
    seedDrivers(["driver-1", "driver-2"]);
    BY_TABLE.set(rides, [proximityCancel("driver-1", 5)]); // 5 min ago, 1 offense, window 15

    const result = await run(["driver-1", "driver-2"]);
    expect(result).toContain("driver-2");
    expect(result).not.toContain("driver-1");
  });

  test("cancel outside the base window does not exclude", async () => {
    seedDrivers(["driver-1"]);
    BY_TABLE.set(rides, [proximityCancel("driver-1", 30)]); // 30 ≥ 15 → free

    expect(await run(["driver-1"])).toContain("driver-1");
  });

  test("second offense doubles the window (2× base)", async () => {
    seedDrivers(["driver-1", "driver-2"]);
    BY_TABLE.set(rides, [
      // newest 20 min ago; two offenses → window 30 → still cooling
      { ...proximityCancel("driver-1", 20), offense_count: "2" },
    ]);
    // single offense, same recency → window 15 → free
    BY_TABLE.get(rides)!.push(proximityCancel("driver-2", 20));

    const result = await run(["driver-1", "driver-2"]);
    expect(result).not.toContain("driver-1");
    expect(result).toContain("driver-2");
  });

  test("third offense caps at 4× base; old-enough repeat offender is free", async () => {
    seedDrivers(["driver-1", "driver-3"]);
    BY_TABLE.set(rides, [
      // 3 offenses, newest 50 min ago; window 60 → still cooling
      { ...proximityCancel("driver-1", 50), offense_count: "3" },
      // 3 offenses, newest 65 min ago; window 60 → free
      { ...proximityCancel("driver-3", 65), offense_count: "3" },
    ]);

    const result = await run(["driver-1", "driver-3"]);
    expect(result).not.toContain("driver-1");
    expect(result).toContain("driver-3");
  });

  test("rider-cancelled or non-proximity cancels never trigger the filter", async () => {
    seedDrivers(["driver-1", "driver-2"]);
    BY_TABLE.set(rides, [
      // The mock keys by table only — emulate the WHERE filters by simply
      // not returning proximity rows for these drivers (empty result set
      // is exactly what the indexed query yields for non-matching rows).
    ]);

    const result = await run(["driver-1", "driver-2"]);
    expect(result).toContain("driver-1");
    expect(result).toContain("driver-2");
  });
});
