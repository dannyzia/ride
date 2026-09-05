/**
 * P1-21 (gap ledger): driver account + info routes — insurance, pricing-
 * reference, call-ledger, and driver/me (GET recovery fields + PATCH gates).
 *
 * Notable invariants:
 *  - insurance: platform_config read fresh per request; invalid/absent config
 *    falls back to defaults; suspended/rejected drivers get covered=false
 *  - pricing-reference: stage0 hides the v6 breakdown entirely
 *  - driver/me PATCH: vehicle_type and phone are NOT patchable (N1 third
 *    unguarded write path; M-8 identity transfer) — asserted via
 *    validation_error on both
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/validateMinPerKm", () => ({
  validateMinPerKm: jest.fn(),
}));
jest.mock("@/lib/storageUrl", () => ({
  isAllowedStorageUrl: jest.fn(),
}));
jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { validateMinPerKm } from "@/lib/validateMinPerKm";
import { isAllowedStorageUrl } from "@/lib/storageUrl";
import { getFareFrameworkConfig } from "@/lib/fareFrameworkConfig";
import { users, drivers } from "@/src/db/schema";
import { GET as insuranceGET } from "@/app/api/driver/insurance+api";
import { GET as pricingGET } from "@/app/api/driver/pricing-reference+api";
import { GET as ledgerGET } from "@/app/api/driver/call-ledger+api";
import { GET as meGET, PATCH as mePATCH } from "@/app/api/driver/me+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

const driverUpdates: { table: unknown; set: Row }[] = [];
const userUpdates: { table: unknown; set: Row }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  driverUpdates.length = 0;
  userUpdates.length = 0;
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (isAllowedStorageUrl as jest.Mock).mockReturnValue(true);
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(async () => {
        if (table === drivers) driverUpdates.push({ table, set: setObj });
        if (table === users) userUpdates.push({ table, set: setObj });
        return [];
      }),
    })),
  }));
});

describe("GET /api/driver/insurance", () => {
  test("404 driver_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await insuranceGET(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("active driver: covered=true with built-in defaults when no config row", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ status: "active" }], []]);

    const res = await insuranceGET(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.covered).toBe(true);
    expect(body.provider_name).toBe("Ride Partner Insurance");
    expect(Array.isArray(body.coverage)).toBe(true);
  });

  test("suspended driver: covered=false", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ status: "suspended" }], []]);
    const res = await insuranceGET(jsonRequest());
    expect((await getJson(res)).covered).toBe(false);
  });

  test("valid admin config overrides the defaults (fresh read, never cached)", async () => {
    const adminConfig = {
      provider_name: "Green Delta",
      policy_number: "GD-77",
      coverage: [{ title: "Theft", description: "Covers theft of the vehicle." }],
      support_phone: "+8801700000000",
    };
    mockSelectQueue([[{ id: USER_ID }], [{ status: "active" }], [{ value: JSON.stringify(adminConfig) }]]);

    const body = await getJson(await insuranceGET(jsonRequest()));
    expect(body.provider_name).toBe("Green Delta");
    expect(body.coverage).toEqual(adminConfig.coverage);
  });

  test("config that is not valid JSON falls back to defaults", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ status: "active" }], [{ value: "{not json" }]]);
    const body = await getJson(await insuranceGET(jsonRequest()));
    expect(body.provider_name).toBe("Ride Partner Insurance");
  });

  test("config that fails schema validation falls back to defaults", async () => {
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ status: "active" }],
      [{ value: JSON.stringify({ provider_name: "X" }) }],
    ]);
    const body = await getJson(await insuranceGET(jsonRequest()));
    expect(body.provider_name).toBe("Ride Partner Insurance");
  });
});

describe("GET /api/driver/pricing-reference", () => {
  test("404 driver_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await pricingGET(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("stage0: v6 breakdown hidden entirely", async () => {
    mockSelectQueue([[{ vehicle_type: "bike_basic" }], []]);
    (getFareFrameworkConfig as jest.Mock).mockResolvedValue({ fare_framework_stage: "stage0" });

    const res = await pricingGET(jsonRequest());
    expect(await getJson(res)).toEqual({ stage: "stage0", visible: false, pricing: null });
  });

  test("stage1: v6 parameters returned with 0% commission and parsed zone-fee flag", async () => {
    mockSelectQueue([
      [{ vehicle_type: "bike_basic" }],
      [{ per_km_bdt: "1500", per_min_bdt: "50", base_km: "2", floor_length_km: "1", free_wait_minutes: "3" }],
    ]);
    (getFareFrameworkConfig as jest.Mock)
      .mockResolvedValueOnce({ fare_framework_stage: "stage1" })
      .mockResolvedValueOnce({ zone_fee_enabled: "true" });

    const res = await pricingGET(jsonRequest());
    const body = await getJson(res);
    expect(body.visible).toBe(true);
    expect(body.pricing).toMatchObject({
      vehicle_type: "bike_basic",
      per_km_bdt: 1500,
      per_min_bdt: 50,
      platform_commission_percent: 0, // v6 = subscription-only
      zone_fee_enabled: true,
    });
  });

  test("stage1 without an active pricing row: visible but null pricing", async () => {
    mockSelectQueue([[{ vehicle_type: "bike_basic" }], []]);
    (getFareFrameworkConfig as jest.Mock).mockResolvedValue({ fare_framework_stage: "stage1" });

    const res = await pricingGET(jsonRequest());
    const body = await getJson(res);
    expect(body.visible).toBe(true);
    expect(body.pricing).toBeNull();
  });
});

describe("GET /api/driver/call-ledger", () => {
  test("404 driver_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await ledgerGET(jsonRequest(undefined, "http://localhost/test"));
    expect(res.status).toBe(404);
  });

  test("400 validation_error for an unknown event_type filter", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], []]);
    const res = await ledgerGET(jsonRequest(undefined, "http://localhost/test?event_type=sidian"));
    expect(res.status).toBe(400);
  });

  test("returns entries plus the live subscription balance", async () => {
    const entries = [{ id: "cl-1", event_type: "deduction", reason: "offer_sent" }];
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [{ calls_remaining: 12 }], entries]);

    const res = await ledgerGET(jsonRequest(undefined, "http://localhost/test?limit=50"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.entries).toEqual(entries);
    expect(body.current_balance).toBe(12);
  });
});

describe("GET /api/driver/me", () => {
  test("returns recovery fields and boundary-converted numerics", async () => {
    mockSelectQueue([
      [{ id: USER_ID, name: "Kamal", phone: "+8801712345678", email: null, profile_image_url: null }],
      [{ id: DRIVER_ID, rating: "4.65", acceptance_rate: "88.00", on_break: false, break_started_at: null }],
      [{ calls_remaining: 7 }],
      [{ id: "sess-1", went_online_at: new Date("2026-09-05T08:00:00Z") }],
      [{ id: "ride-9", status: "in_progress" }],
    ]);

    const res = await meGET(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const driver = body.driver as Record<string, unknown>;
    expect(driver.rating).toBe(4.65); // string → number at the API boundary
    expect(driver.acceptance_rate).toBe(88);
    expect(driver.calls_remaining).toBe(7);
    expect(driver.has_active_session).toBe(true);
    expect(driver.current_ride_id).toBe("ride-9");
  });

  test("no active session or ride → recovery fields null", async () => {
    mockSelectQueue([
      [{ id: USER_ID, name: "K", phone: "", email: null, profile_image_url: null }],
      [{ id: DRIVER_ID, rating: null, acceptance_rate: null, on_break: false, break_started_at: null }],
      [],
      [],
      [],
    ]);

    const body = await getJson(await meGET(jsonRequest()));
    const driver = body.driver as Record<string, unknown>;
    expect(driver.has_active_session).toBe(false);
    expect(driver.current_ride_id).toBeNull();
    expect(driver.rating).toBeNull();
    expect(driver.calls_remaining).toBe(0);
  });
});

describe("PATCH /api/driver/me — guarded fields", () => {
  test("vehicle_type is NOT patchable (N1: third unguarded write path) — silently stripped", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID, vehicle_type: "bike_basic" }], [{ id: DRIVER_ID, vehicle_type: "bike_basic" }]]);
    const res = await mePATCH(jsonRequest({ vehicle_type: "car_economy" }));
    expect(res.status).toBe(200);
    // the dispatch-facing type must never change through this route
    expect(driverUpdates.some((u) => u.set.vehicle_type !== undefined)).toBe(false);
  });

  test("phone is NOT patchable (M-8: identity transfer) — silently stripped", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [{ id: DRIVER_ID }]]);
    const res = await mePATCH(jsonRequest({ phone: "+8801799999999" }));
    expect(res.status).toBe(200);
    expect(userUpdates.some((u) => u.set.phone !== undefined)).toBe(false);
  });

  test("400 invalid_storage_url for a non-Ride profile image (C3a)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    (isAllowedStorageUrl as jest.Mock).mockReturnValue(false);
    const res = await mePATCH(jsonRequest({ profile_image_url: "https://evil.example/a.jpg" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_storage_url");
  });

  test("422 min_per_km_out_of_bounds with the system rate echoed", async () => {
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: DRIVER_ID, vehicle_type: "bike_basic" }],
      [{ per_km_bdt: 1500 }],
      [{ key: "driver_min_ratio", value: "0.70" }, { key: "driver_max_ratio", value: "1.50" }],
    ]);
    (validateMinPerKm as jest.Mock).mockReturnValue({ valid: false, error: "Below floor" });

    const res = await mePATCH(jsonRequest({ min_per_km_bdt: 200 }));
    expect(res.status).toBe(422);
    const body = await getJson(res);
    expect(body.error).toBe("min_per_km_out_of_bounds");
    expect(body.system_rate_bdt).toBe(1500);
  });

  test("min_per_km 0 clears the floor without consulting pricing", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID, vehicle_type: "bike_basic" }], [{ id: DRIVER_ID, min_per_km_bdt: null }]]);

    const res = await mePATCH(jsonRequest({ min_per_km_bdt: 0 }));
    expect(res.status).toBe(200);
    expect(driverUpdates[0].set.min_per_km_bdt).toBeNull();
    expect(userUpdates).toHaveLength(0);
  });

  test("profile fields route to the users table; driver fields to drivers", async () => {
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: DRIVER_ID, vehicle_type: "bike_basic" }],
      [{ id: DRIVER_ID, auto_accept_enabled: true }],
    ]);

    const res = await mePATCH(jsonRequest({
      name: "Renamed",
      city: "Dhaka",
      auto_accept_enabled: true,
    }));
    expect(res.status).toBe(200);
    expect(userUpdates[0].set).toMatchObject({ name: "Renamed", city: "Dhaka" });
    expect(driverUpdates[0].set).toMatchObject({ auto_accept_enabled: true });
  });
});
