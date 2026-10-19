/* eslint-disable import/first */
/**
 * C3-6 (STAGE C3-FIX, PRIVACY): no raw driver phone anywhere in match
 * payloads. The REST half is GET /api/ride/[id] — neither `driver` nor
 * `ride.driver` may contain a phone key (in-app chat is the contact
 * channel; masked call is DEFERRED). The WS half (ride:status matched) is
 * pinned in utils-server/__tests__/c3-match-privacy.test.ts.
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: async () => ({ id: "auth-uid-1" }),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));

import { db } from "@/src/db";
import { GET as getRide } from "@/app/api/ride/[id]/index+api";

const RIDE_ID = "11111111-1111-4111-a111-111111111111";
const RIDER_USER_ID = "rider-user-1";
const DRIVER_ID = "33333333-3333-4333-a333-333333333333";

function queuedSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.innerJoin = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    return c;
  });
}

function getRequest(): Request {
  return {
    headers: { get: () => "Bearer tok" },
    url: "http://localhost/",
  } as unknown as Request;
}

const RIDE_ROW = {
  id: RIDE_ID,
  user_id: RIDER_USER_ID,
  driver_id: DRIVER_ID,
  origin_latitude: "23.8103",
  origin_longitude: "90.4125",
  destination_latitude: "23.8203",
  destination_longitude: "90.4225",
  distance_km: "5.500",
  fare_breakdown: { total_bdt: 32000 },
  start_pin: "1234",
  rider_payable_bdt: 32000,
  rider_cash_tendered_bdt: null,
  driver_cash_received_bdt: null,
};

// Mirrors the post-C3-6 driverInfo select: no phone column to leak.
const DRIVER_INFO_ROW = {
  id: DRIVER_ID,
  name: "Kamal Hossain",
  profile_image_url: null,
  vehicle_type: "cng",
  rating: "4.80",
  rating_count: 120,
};

beforeEach(() => jest.clearAllMocks());

describe("GET /api/ride/[id] (C3-6 match privacy)", () => {
  it("driver payload carries identity + vehicle, never a phone", async () => {
    queuedSelects([[{ id: RIDER_USER_ID }], [RIDE_ROW], [DRIVER_INFO_ROW]]);
    const res = await getRide(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.driver.full_name).toBe("Kamal Hossain");
    expect("phone" in body.driver).toBe(false);
    expect(JSON.stringify(body.driver)).not.toContain("880");
  });

  it("embedded ride.driver carries no phone either", async () => {
    queuedSelects([[{ id: RIDER_USER_ID }], [RIDE_ROW], [DRIVER_INFO_ROW]]);
    const res = await getRide(getRequest(), { id: RIDE_ID });
    const body = await res.json();
    expect("phone" in (body.ride.driver ?? {})).toBe(false);
  });

  it("unassigned ride still resolves without phone", async () => {
    queuedSelects([[{ id: RIDER_USER_ID }], [{ ...RIDE_ROW, driver_id: null }]]);
    const res = await getRide(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.driver).toBeNull();
  });
});
