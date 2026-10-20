/**
 * S8 dispatch candidate-loop suite (§6.2.1): women-only matching in
 * buildCandidateList (utils-server/dispatch.ts) through the single shared
 * predicate (lib/womenOnlyEligibility.ts).
 *
 *  - women-only bike rides admit verified female drivers ONLY
 *  - mixed bike rides exclude armed (women_only_enabled) drivers while the
 *    kill switch is ON, and admit them while it is OFF
 *  - missing ride row fails closed (empty candidates)
 *  - car/CNG rides ignore the toggle (R11-C1 fail-open scope assertion)
 *
 * DB and H3 index are mocked per the dispatch-blocklist.test.ts pattern
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
  BIKE_FAMILY: ["bike_basic", "bike_standard", "bike_plus", "scooter"],
}));
jest.mock("../../lib/platformConfig", () => ({
  getPlan05Bool: jest.fn(async () => false),
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
import { drivers, pricing, rides } from "../../src/db/schema";
import { getPlan05Bool } from "../../lib/platformConfig";
import { getDriversInCells } from "../h3Index";
import { buildCandidateList } from "../dispatch";

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
  BY_TABLE.set(pricing, [{ per_km_bdt: 775 }]);
});

function driverRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    last_location_lat: "23.8103",
    last_location_lng: "90.4125",
    rating: "4.5",
    acceptance_rate: "90.00",
    last_location_at: new Date(),
    completed_rides_count: 20,
    min_per_km_bdt: null,
    vehicle_type: "bike_basic",
    gender: "male",
    gender_verified: false,
    women_only_enabled: false,
    auto_accept_enabled: false,
    auto_accept_radius_meters: null,
    subscription_id: "sub-1",
    calls_remaining: 5,
    daily_calls_used: 0,
    daily_cap: 50,
    ...over,
  };
}

const FEMALE_VERIFIED = { gender: "female", gender_verified: true };
const FEMALE_UNVERIFIED = { gender: "female", gender_verified: false };

function seedRide(ride: Record<string, unknown>): void {
  BY_TABLE.set(rides, [ride]);
}

function seedDrivers(rows: Record<string, unknown>[]): void {
  (getDriversInCells as jest.Mock).mockReturnValue(rows.map((r) => r.id));
  BY_TABLE.set(drivers, rows);
}

function run(vehicleType = "bike_basic") {
  return buildCandidateList("ride-wo", 23.8103, 90.4125, 23.8203, 90.4225, vehicleType, "zone-xyz", []).then(
    (scored) => scored.map((s) => s.driverId),
  );
}

describe("buildCandidateList — women-only matching (S8)", () => {
  test("women-only bike ride admits verified female drivers ONLY", async () => {
    seedRide({ user_id: "rider-1", women_only: true, vehicle_type: "bike_basic" });
    seedDrivers([
      driverRow("d-verified", FEMALE_VERIFIED),
      driverRow("d-unverified", FEMALE_UNVERIFIED),
      driverRow("d-male"),
    ]);

    const result = await run();
    expect(result).toEqual(["d-verified"]);
  });

  test("mixed bike ride excludes armed drivers while kill switch is ON", async () => {
    (getPlan05Bool as jest.Mock).mockResolvedValueOnce(true);
    seedRide({ user_id: "rider-1", women_only: false, vehicle_type: "bike_basic" });
    seedDrivers([
      driverRow("d-armed", { ...FEMALE_VERIFIED, women_only_enabled: true }),
      driverRow("d-plain", FEMALE_VERIFIED),
    ]);

    const result = await run();
    expect(result).toEqual(["d-plain"]);
  });

  test("mixed bike ride admits armed drivers when kill switch is OFF", async () => {
    seedRide({ user_id: "rider-1", women_only: false, vehicle_type: "bike_basic" });
    seedDrivers([
      driverRow("d-armed", { ...FEMALE_VERIFIED, women_only_enabled: true }),
      driverRow("d-plain", FEMALE_VERIFIED),
    ]);

    const result = await run();
    expect(result).toContain("d-armed");
    expect(result).toContain("d-plain");
  });

  test("missing ride row fails closed (empty candidates, no dispatch)", async () => {
    BY_TABLE.set(rides, []);
    seedDrivers([driverRow("d-verified", FEMALE_VERIFIED)]);

    expect(await run()).toEqual([]);
  });

  test("R11-C1: women_only=true on a CAR ride does not restrict the pool", async () => {
    seedRide({ user_id: "rider-1", women_only: true, vehicle_type: "car_economy" });
    seedDrivers([
      driverRow("d-armed", {
        ...FEMALE_VERIFIED,
        women_only_enabled: true,
        vehicle_type: "car_economy",
      }),
      driverRow("d-male", { vehicle_type: "car_economy" }),
    ]);

    const result = await run("car_economy");
    expect(result).toContain("d-armed");
    expect(result).toContain("d-male");
  });

  test("women-only ride with zero female supply yields empty candidates", async () => {
    seedRide({ user_id: "rider-1", women_only: true, vehicle_type: "bike_basic" });
    seedDrivers([driverRow("d-male-1"), driverRow("d-male-2")]);

    expect(await run()).toEqual([]);
  });
});
