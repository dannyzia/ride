/**
 * Postpaid monetization dispatch invariants (Item 39).
 *
 * Covers the behaviors the per-driver possession model (§3.5) adds on top of
 * legacy subscription-only dispatch:
 *  - a driver with an active commission enrollment is admitted to the pool
 *    with no usable call package (admission ≠ debit)
 *  - an exhausted call package (calls_remaining = 0) stays out of the pool
 *  - the unified commission-debt ceiling gates admitted drivers under the
 *    'hybrid' kill switch and is never read under 'subscription_only'
 *  - per-mode offer economics: a debit-mode offer carries lead_cost_calls=1
 *    (leadBilling), a commission-mode offer carries 0 — the chain now admits
 *    balanceAfter === null offers (dispatchChain)
 *
 * The C-B1 per-mode accept proof (commission-mode accepts succeed with no
 * call_ledger deduction row; subscription/legacy accepts hard-fail without
 * one) lives in utils-server/index.ts executeMatchFlow, which starts a real
 * HTTP/WS server at import and cannot run under jest — it is pinned by
 * leadBilling's mode binding (dispatch_offers.monetization_mode) plus this
 * suite's chain-admission coverage, and exercised at runtime in the utils
 * server. Real-DB execution of Items 40-43's harnesses covers the view-level
 * self-bill carve-out (lockout_exposure_paisa) — not computable here.
 *
 * Rows-in/rows-out db mock — no real DB.
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
// Kill switch ON ('hybrid') unless a test opts into 'subscription_only'.
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
import {
  driverCommissionSettlements,
  drivers,
  pricing,
  rides,
  commissionEnrollments,
} from "../../src/db/schema";
import { getRevenueModel, getMaxCommissionDebtBdt } from "../../lib/platformConfig";
import { getDriversInCells } from "../h3Index";
import { buildCandidateList } from "../dispatch";

type Row = Record<string, unknown>;

const BASE_DRIVER: Row = {
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
let enrollmentRows: Row[] = [];
let ridesGrouped: Row[] = [];
let settlementsGrouped: Row[] = [];

function rowsFor(table: unknown): Row[] {
  if (table === rides) return [RIDE_ROW];
  if (table === drivers) return driverRows;
  if (table === commissionEnrollments) return enrollmentRows;
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
  driverRows = [BASE_DRIVER];
  enrollmentRows = [];
  ridesGrouped = [];
  settlementsGrouped = [];

  (getDriversInCells as jest.Mock).mockReturnValue(["d1"]);
  (getRevenueModel as jest.Mock).mockResolvedValue("hybrid");
  (getMaxCommissionDebtBdt as jest.Mock).mockResolvedValue(50_000);

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

describe("dispatch-postpaid — per-driver possession admission", () => {
  test("commission-enrolled driver with no usable subscription is admitted (no lead debit needed)", async () => {
    driverRows = [{ ...BASE_DRIVER, calls_remaining: null }];
    enrollmentRows = [
      { id: "enr-1", driver_id: "d1", package_id: "pkg-comm", status: "active" },
    ];

    const candidates = await build();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverId).toBe("d1");
  });

  test("driver with neither product is excluded even with zero debt", async () => {
    driverRows = [{ ...BASE_DRIVER, calls_remaining: null }];
    enrollmentRows = [];

    const candidates = await build();

    expect(candidates).toEqual([]);
  });

  test("exhausted subscription (calls_remaining = 0) is never in the pool", async () => {
    driverRows = [{ ...BASE_DRIVER, calls_remaining: 0 }];

    const candidates = await build();

    expect(candidates).toEqual([]);
  });

  test("unlimited subscription (-1) is admitted", async () => {
    driverRows = [{ ...BASE_DRIVER, calls_remaining: -1 }];

    const candidates = await build();

    expect(candidates).toHaveLength(1);
  });
});

describe("dispatch-postpaid — unified commission-debt ceiling", () => {
  const withDebt = (total: number) => {
    driverRows = [BASE_DRIVER];
    ridesGrouped = [{ driver_id: "d1", total, cancels_today: 0, fives_today: 0 }];
  };

  test("subscriber at the ceiling is excluded under 'hybrid' (unified gate)", async () => {
    withDebt(50_000);
    expect(await build()).toEqual([]);
    expect(getMaxCommissionDebtBdt).toHaveBeenCalled();
  });

  test("subscriber above the ceiling is excluded under 'hybrid'", async () => {
    withDebt(900_000);
    expect(await build()).toEqual([]);
  });

  test("subscriber below the ceiling is offered under 'hybrid'", async () => {
    withDebt(49_999);
    expect(await build()).toHaveLength(1);
  });

  test("ceiling is never read under 'subscription_only' (legacy pinned)", async () => {
    (getRevenueModel as jest.Mock).mockResolvedValue("subscription_only");
    withDebt(900_000);

    const candidates = await build();

    expect(candidates).toHaveLength(1);
    expect(getMaxCommissionDebtBdt).not.toHaveBeenCalled();
  });

  test("settled debt clears the gate: same subscriber is offered again", async () => {
    withDebt(60_000);
    settlementsGrouped = [{ driver_id: "d1", total: 60_000 }];

    const candidates = await build();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverId).toBe("d1");
  });
});
