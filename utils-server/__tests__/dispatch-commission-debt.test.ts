/**
 * Commission-debt dispatch gate (revenue_model subscription_only / hybrid).
 *
 * `commission_only` was removed from the revenue_model allowed set (Stage 1);
 * the kill switch is now binary: OFF ('subscription_only', legacy — the
 * ceiling is never read) or ON ('hybrid' — per-driver possession governs and
 * the UNIFIED ceiling gates EVERY admitted driver, subscribers included).
 *
 * A driver whose net commission debt (accrued completed-ride commission minus
 * completed settlements) reaches `max_commission_debt_bdt` must not enter the
 * candidate pool until they settle — under 'hybrid' this applies to
 * subscribers just as to commission holders.
 *
 * Paired assertions: the SAME driver with the same accrual is offered once
 * the settlement rows cover it — proving the filter reads the debt figure
 * rather than accidentally dropping the candidate for another reason.
 *
 * Gated like all utils-server suites: nothing here connects to a real DB —
 * the db/platformConfig mocks are rows-in/rows-out.
 */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), execute: jest.fn() },
}));
jest.mock("../h3Index", () => ({
  getDriversInCells: jest.fn(),
  getIndexedDriverCount: jest.fn(() => 1),
}));
jest.mock("../../lib/h3", () => ({
  getH3Ring: jest.fn(() => ["cell1"]),
}));
jest.mock("../../lib/vehicleTypes", () => ({
  checkDriverEligibility: jest.fn(() => ({ eligible: true })),
  BIKE_FAMILY: ["bike_basic", "bike_standard", "bike_plus", "scooter"],
}));
// Kill switch ON ('hybrid') for the ceiling tests; 'subscription_only' is
// opted into per-test where the legacy pinned behavior is asserted.
jest.mock("../../lib/platformConfig", () => ({
  getPlan05Bool: jest.fn(async () => false),
  getRevenueModel: jest.fn(async () => "hybrid"),
  getMaxCommissionDebtBdt: jest.fn(async () => 50_000),
}));
jest.mock("../../lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async () => ({})),
  parseConfigNumber: jest.fn((_v: string, fallback: number) => fallback),
  parseConfigBool: jest.fn(() => false),
}));
jest.mock("../coldDrop", () => ({
  getColdDropInfos: jest.fn(async () => new Map()),
}));

import { db } from "../../src/db";
import { driverCommissionSettlements, drivers, pricing, rides } from "../../src/db/schema";
import { getRevenueModel, getMaxCommissionDebtBdt } from "../../lib/platformConfig";
import { getDriversInCells } from "../h3Index";
import { buildCandidateList } from "../dispatch";

type Row = Record<string, unknown>;

const DRIVER_ROW: Row = {
  id: "d1",
  created_at: new Date(),
  last_location_lat: "23.8103",
  last_location_lng: "90.4125",
  rating: "5.00",
  acceptance_rate: "100",
  last_location_at: new Date(),
  completed_rides_count: 50,
  min_per_km_bdt: null,
  vehicle_type: "bike_basic",
  gender: "male",
  gender_verified: false,
  women_only_enabled: false,
  auto_accept_enabled: false,
  auto_accept_radius_meters: 500,
  subscription_id: null,
  calls_remaining: null,
  daily_calls_used: null,
  daily_cap: null,
};

const SUBSCRIBED_DRIVER: Row = {
  ...DRIVER_ROW,
  subscription_id: "sub-1",
  calls_remaining: 5,
  daily_calls_used: 0,
  daily_cap: 50,
};

const RIDE_ROW: Row = {
  user_id: "rider-1",
  women_only: false,
  vehicle_type: "bike_basic",
};

let driverRows: Row[] = [];
let ridesGrouped: Row[] = [];
let settlementsGrouped: Row[] = [];

function rowsFor(table: unknown): Row[] {
  if (table === rides) return [RIDE_ROW];
  if (table === drivers) return driverRows;
  if (table === pricing) return [{ per_km_bdt: 775 }];
  return [];
}

function groupedFor(table: unknown): Row[] {
  if (table === rides) return ridesGrouped;
  if (table === driverCommissionSettlements) return settlementsGrouped;
  return [];
}

beforeEach(() => {
  jest.clearAllMocks();
  driverRows = [DRIVER_ROW];
  ridesGrouped = [];
  settlementsGrouped = [];

  (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
  (getRevenueModel as jest.Mock).mockResolvedValue("hybrid");
  (getMaxCommissionDebtBdt as jest.Mock).mockResolvedValue(50_000);

  // `limit(1)` reads (ride, pricing) and awaited `.where()` reads (drivers,
  // dispatch offers, scoring weights) share one chain; grouped aggregates go
  // through `.groupBy()`.
  (db.select as jest.Mock).mockImplementation(() => ({
    from: (table: unknown) => {
      const chain: any = {
        leftJoin: () => chain,
        where: () => {
          const after: any = {
            limit: async (n: number) => rowsFor(table).slice(0, n),
            groupBy: async () => groupedFor(table),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(rowsFor(table)).then(resolve, reject),
          };
          return after;
        },
      };
      return chain;
    },
  }));
});

const build = () =>
  buildCandidateList("ride-1", 23.8103, 90.4125, 23.8203, 90.4225, "bike_basic", "z", []);

describe("buildCandidateList — commission debt ceiling (kill switch ON = hybrid)", () => {
  test("subscriber at/over the ceiling is excluded from the pool — unified gate in both modes", async () => {
    // ৳600 accrued (60,000 paisa), nothing settled → net debt 60,000 >= 50,000.
    driverRows = [SUBSCRIBED_DRIVER];
    ridesGrouped = [
      { driver_id: "d1", total: 60_000, cancels_today: 0, fives_today: 0 },
    ];

    const candidates = await build();

    expect(candidates).toEqual([]);
    expect(getMaxCommissionDebtBdt).toHaveBeenCalled();
  });

  test("fault pair: the same subscriber IS offered once settlements clear the debt", async () => {
    driverRows = [SUBSCRIBED_DRIVER];
    ridesGrouped = [
      { driver_id: "d1", total: 60_000, cancels_today: 0, fives_today: 0 },
    ];
    settlementsGrouped = [{ driver_id: "d1", total: 60_000 }];

    const candidates = await build();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverId).toBe("d1");
  });

  test("below the ceiling stays eligible (floor comparison, not zero-tolerance)", async () => {
    driverRows = [SUBSCRIBED_DRIVER];
    ridesGrouped = [
      { driver_id: "d1", total: 49_999, cancels_today: 0, fives_today: 0 },
    ];

    const candidates = await build();

    expect(candidates).toHaveLength(1);
  });

  test("subscription_only (kill switch OFF) disables the debt gate entirely — not even read", async () => {
    (getRevenueModel as jest.Mock).mockResolvedValue("subscription_only");
    driverRows = [SUBSCRIBED_DRIVER];
    ridesGrouped = [
      { driver_id: "d1", total: 900_000, cancels_today: 0, fives_today: 0 },
    ];

    const candidates = await build();

    expect(candidates).toHaveLength(1);
    // The ceiling must not even be read when commission is not gated.
    expect(getMaxCommissionDebtBdt).not.toHaveBeenCalled();
  });
});
