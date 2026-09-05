/**
 * P1-21 (gap ledger): POST /api/driver/vehicle-type-change.
 * Invariants:
 *  - same-type no-op (422), online switch requires explicit confirmation (409
 *    requires_confirmation), tier eligibility gate (422)
 *  - success syncs BOTH tables in one tx: drivers.vehicle_type (dispatch
 *    reads it) and vehicles.vehicle_type (admin-facing source) must never
 *    diverge
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  requireRole: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/vehicleTypes", () => ({
  VEHICLE_TYPE_VALUES: ["bike_basic", "bike_standard", "car_economy"],
  checkDriverEligibility: jest.fn(),
}));

import { db } from "@/src/db";
import { requireRole } from "@/lib/auth";
import { checkDriverEligibility } from "@/lib/vehicleTypes";
import { drivers, vehicles } from "@/src/db/schema";
import { POST } from "@/app/api/driver/vehicle-type-change+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const DRIVER_OFFLINE: Row = {
  id: DRIVER_ID,
  vehicle_type: "bike_basic",
  is_online: false,
  completed_rides_count: 30,
  rating: "4.6",
};

function jsonRequest(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** call 0: users · call 1: drivers */
function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

const txUpdates: { table: unknown; set: Row }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  txUpdates.length = 0;
  // requireRole('driver') returns a guard FUNCTION; the route awaits guard(request)
  (requireRole as jest.Mock).mockImplementation(() =>
    jest.fn(async () => ({ supabaseUser: { id: SUPABASE_UID } })),
  );
  (checkDriverEligibility as jest.Mock).mockReturnValue({ eligible: true });
  mockSelectQueue([[{ id: USER_ID }], [DRIVER_OFFLINE]]);
  const tx = {
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          txUpdates.push({ table, set: setObj });
          return [];
        }),
      })),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
});

describe("POST /api/driver/vehicle-type-change", () => {
  test("401 unauthorized when requireRole rejects", async () => {
    (requireRole as jest.Mock).mockImplementation(() =>
      jest.fn(async () => {
        throw { status: 401 };
      }),
    );
    const res = await POST(jsonRequest({ new_vehicle_type: "car_economy" }));
    expect(res.status).toBe(401);
  });

  test("400 validation_error for a type outside the enum", async () => {
    const res = await POST(jsonRequest({ new_vehicle_type: "hoverboard" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("422 already_current_type is a no-op", async () => {
    const res = await POST(jsonRequest({ new_vehicle_type: "bike_basic" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("already_current_type");
    expect(txUpdates).toHaveLength(0);
  });

  test("409 online_switch_requires_confirmation while online without consent", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ ...DRIVER_OFFLINE, is_online: true }]]);

    const res = await POST(jsonRequest({ new_vehicle_type: "car_economy" }));
    expect(res.status).toBe(409);
    expect((await getJson(res)).requires_confirmation).toBe(true);
    expect(txUpdates).toHaveLength(0);
  });

  test("online switch proceeds with confirm_online_switch=true", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ ...DRIVER_OFFLINE, is_online: true }]]);

    const res = await POST(jsonRequest({
      new_vehicle_type: "car_economy",
      confirm_online_switch: true,
    }));
    expect(res.status).toBe(200);
    expect(txUpdates).toHaveLength(2);
  });

  test("422 eligibility_not_met with the checker's reason", async () => {
    (checkDriverEligibility as jest.Mock).mockReturnValue({
      eligible: false,
      reason: "Needs 50 more completed rides",
    });
    const res = await POST(jsonRequest({ new_vehicle_type: "car_economy" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("eligibility_not_met");
    expect(txUpdates).toHaveLength(0);
  });

  test("success syncs drivers AND vehicles tables in one tx (no divergence)", async () => {
    const res = await POST(jsonRequest({ new_vehicle_type: "car_economy" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, vehicle_type: "car_economy" });

    expect(txUpdates).toHaveLength(2);
    expect(txUpdates[0].table).toBe(drivers);
    expect(txUpdates[0].set.vehicle_type).toBe("car_economy");
    expect(txUpdates[1].table).toBe(vehicles);
    expect(txUpdates[1].set.vehicle_type).toBe("car_economy");
  });
});
