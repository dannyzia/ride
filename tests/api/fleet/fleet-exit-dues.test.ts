/**
 * Unit & Contract Tests: Fleet Exit & Delisting + Dues Gate (ISSUE-36 / Plan 27 §4.4)
 * Validates BD-1..3 rulings:
 *   BD-1: Dues gate blocks exit entirely if wallet balance is negative or ride active.
 *   BD-2: Platform admin can override the block; audited in audit_logs.
 *   BD-3: Fleet overdue billing blocks vehicle delisting.
 */
import {
  checkDriverExitDues,
  checkFleetVehicleExitDues,
  delistVehicleFromFleet,
  removeDriverFromFleet,
  FleetExitError,
} from "@/lib/fleetAssignment";
import { POST as delistVehicleRoute } from "@/app/api/fleet/vehicles/[id]/delist+api";
import { POST as removeDriverRoute } from "@/app/api/fleet/drivers/[id]/remove+api";
import { POST as leaveFleetRoute } from "@/app/api/driver/fleet/leave+api";

const FLEET_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const VEHICLE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

let mockDriverRows: Record<string, unknown>[] = [];
let mockVehicleRows: Record<string, unknown>[] = [];
let mockRideRows: Record<string, unknown>[] = [];
let mockBillingRows: Record<string, unknown>[] = [];
let mockAssignmentRows: Record<string, unknown>[] = [];
let mockUserRows: Record<string, unknown>[] = [];
let mockFleetRows: Record<string, unknown>[] = [];

let mockCapturedInserts: { table: unknown; vals: Record<string, unknown> }[] = [];
let mockCapturedUpdates: { table: unknown; vals: Record<string, unknown> }[] = [];

let mockAuthRole = "OWNER";
let mockAuthStatus: number | null = null;
let mockIsAdmin = false;

jest.mock("@/lib/auth", () => ({
  requireFleetMember: () => async () => {
    if (mockAuthStatus === 401) {
      const err = new Error("unauthorized");
      Object.assign(err, { status: 401 });
      throw err;
    }
    if (mockAuthStatus === 403) {
      const err = new Error("forbidden");
      Object.assign(err, { status: 403 });
      throw err;
    }
    return {
      dbUser: { id: USER_ID, role: mockIsAdmin ? "admin" : "driver" },
      member: { role: mockAuthRole },
    };
  },
  verifySupabaseToken: async () => {
    if (mockAuthStatus === 401) {
      const err = new Error("unauthorized");
      Object.assign(err, { status: 401 });
      throw err;
    }
    return { id: "auth-uid-1" };
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");

  const resolveRows = (t: unknown) => {
    if (t === schema.drivers) return mockDriverRows;
    if (t === schema.vehicles) return mockVehicleRows;
    if (t === schema.rides) return mockRideRows;
    if (t === schema.fleetBillingTransactions) return mockBillingRows;
    if (t === schema.fleetVehicleAssignments) return mockAssignmentRows;
    if (t === schema.users) return mockUserRows;
    if (t === schema.fleets) return mockFleetRows;
    return [];
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.where = () => c;
    c.innerJoin = () => c;
    c.leftJoin = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const makeSelect = () => () => ({
    from: (t: unknown) => ({
      where: () => chainable(resolveRows(t)),
      innerJoin: () => ({ where: () => chainable(resolveRows(t)) }),
      leftJoin: () => ({ where: () => chainable(resolveRows(t)) }),
    }),
  });

  const makeUpdate = () => (t: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: () => {
        mockCapturedUpdates.push({ table: t, vals });
        return Promise.resolve([{ id: "updated" }]);
      },
    }),
  });

  const makeInsert = () => (t: unknown) => ({
    values: (vals: Record<string, unknown>) => {
      mockCapturedInserts.push({ table: t, vals });
      const row = [{ id: "inserted", ...vals }];
      return {
        returning: async () => row,
        then: (res: any, rej: any) => Promise.resolve(row).then(res, rej),
      };
    },
  });

  const makeTx = () => ({
    select: makeSelect(),
    update: makeUpdate(),
    insert: makeInsert(),
  });

  return {
    db: {
      ...makeTx(),
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(makeTx())),
    },
  };
});

describe("ISSUE-36: Fleet Exit / Delisting + Dues Gate", () => {
  beforeEach(() => {
    mockDriverRows = [];
    mockVehicleRows = [];
    mockRideRows = [];
    mockBillingRows = [];
    mockAssignmentRows = [];
    mockUserRows = [];
    mockFleetRows = [];
    mockCapturedInserts = [];
    mockCapturedUpdates = [];
    mockAuthRole = "OWNER";
    mockAuthStatus = null;
    mockIsAdmin = false;
  });

  describe("checkDriverExitDues (BD-1)", () => {
    it("blocks when driver has negative wallet balance (debt)", async () => {
      mockDriverRows = [{ id: DRIVER_ID, balance: -500 }]; // 500 BDT debt
      const { db } = require("@/src/db");

      const res = await checkDriverExitDues(db as any, DRIVER_ID);
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe("driver_has_unsettled_dues");
      expect(res.details).toEqual({ debt_bdt: 500 });
    });

    it("blocks when driver has an active trip in progress", async () => {
      mockDriverRows = [{ id: DRIVER_ID, balance: 100 }];
      mockRideRows = [{ id: "ride-123" }];
      const { db } = require("@/src/db");

      const res = await checkDriverExitDues(db as any, DRIVER_ID);
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe("active_trip_in_progress");
      expect(res.details).toEqual({ ride_id: "ride-123" });
    });

    it("allows exit when driver has no debt and no active ride", async () => {
      mockDriverRows = [{ id: DRIVER_ID, balance: 100 }];
      mockRideRows = [];
      const { db } = require("@/src/db");

      const res = await checkDriverExitDues(db as any, DRIVER_ID);
      expect(res.blocked).toBe(false);
    });
  });

  describe("checkFleetVehicleExitDues (BD-3)", () => {
    it("blocks when assigned driver has an active ride", async () => {
      mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID, driver_id: DRIVER_ID }];
      mockRideRows = [{ id: "ride-456" }];
      const { db } = require("@/src/db");

      const res = await checkFleetVehicleExitDues(db as any, VEHICLE_ID, FLEET_ID);
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe("active_trip_in_progress");
    });

    it("blocks when fleet has overdue billing transactions (BD-3)", async () => {
      mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID, driver_id: null }];
      mockRideRows = [];
      mockBillingRows = [{ id: "tx-overdue", amount_bdt: 2500 }];
      const { db } = require("@/src/db");

      const res = await checkFleetVehicleExitDues(db as any, VEHICLE_ID, FLEET_ID);
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe("fleet_has_overdue_billing");
      expect(res.details).toEqual({ transaction_id: "tx-overdue", amount_bdt: 2500 });
    });

    it("allows delisting when vehicle has no active trip and fleet has no overdue billing", async () => {
      mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID, driver_id: null }];
      mockRideRows = [];
      mockBillingRows = [];
      const { db } = require("@/src/db");

      const res = await checkFleetVehicleExitDues(db as any, VEHICLE_ID, FLEET_ID);
      expect(res.blocked).toBe(false);
    });
  });

  describe("delistVehicleFromFleet & Admin Override (BD-2)", () => {
    it("throws FleetExitError when blocked and not overridden", async () => {
      mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID, driver_id: null }];
      mockBillingRows = [{ id: "tx-overdue", amount_bdt: 2000 }];
      const { db } = require("@/src/db");

      await expect(
        delistVehicleFromFleet(db as any, {
          vehicle_id: VEHICLE_ID,
          fleet_id: FLEET_ID,
          actor_user_id: USER_ID,
        }),
      ).rejects.toThrow(FleetExitError);
    });

    it("allows delisting with admin_override and writes audit log (BD-2)", async () => {
      mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID, driver_id: null }];
      mockBillingRows = [{ id: "tx-overdue", amount_bdt: 2000 }];
      const { db } = require("@/src/db");

      const res = await delistVehicleFromFleet(db as any, {
        vehicle_id: VEHICLE_ID,
        fleet_id: FLEET_ID,
        actor_user_id: USER_ID,
        admin_override: true,
        admin_override_reason: "Special executive clearance",
      });

      expect(res.success).toBe(true);
      expect(mockCapturedInserts.some((i) => i.vals.action === "fleet_vehicle_delist_override")).toBe(true);
    });
  });

  describe("API Route: POST /api/fleet/vehicles/[id]/delist", () => {
    it("returns 400 on invalid uuid", async () => {
      const req = new Request("http://localhost/api/fleet/vehicles/bad-id/delist?fleet_id=" + FLEET_ID, {
        method: "POST",
      });
      const res = await delistVehicleRoute(req, { id: "bad-id" });
      expect(res.status).toBe(400);
    });

    it("returns 409 when dues gate blocks delisting", async () => {
      mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID, driver_id: null }];
      mockBillingRows = [{ id: "tx-overdue", amount_bdt: 1500 }];

      const req = new Request(`http://localhost/api/fleet/vehicles/${VEHICLE_ID}/delist?fleet_id=${FLEET_ID}`, {
        method: "POST",
      });
      const res = await delistVehicleRoute(req, { id: VEHICLE_ID });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("fleet_has_overdue_billing");
    });
  });

  describe("API Route: POST /api/driver/fleet/leave", () => {
    it("returns 400 if driver is not in a fleet", async () => {
      mockUserRows = [{ id: USER_ID, role: "driver" }];
      mockDriverRows = [{ id: DRIVER_ID, fleet_id: null }];

      const req = new Request("http://localhost/api/driver/fleet/leave", {
        method: "POST",
      });
      const res = await leaveFleetRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("not_in_fleet");
    });

    it("returns 409 when driver has unsettled dues (BD-1)", async () => {
      mockUserRows = [{ id: USER_ID, role: "driver" }];
      mockDriverRows = [{ id: DRIVER_ID, fleet_id: FLEET_ID, balance: -1200 }];

      const req = new Request("http://localhost/api/driver/fleet/leave", {
        method: "POST",
      });
      const res = await leaveFleetRoute(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("driver_has_unsettled_dues");
    });
  });
});
