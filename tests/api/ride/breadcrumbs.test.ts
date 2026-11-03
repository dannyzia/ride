/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "sup-user" })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { GET } from "@/app/api/ride/[id]/breadcrumbs+api";

const RIDE_ID = "11111111-1111-4111-a111-111111111111";
const RIDER_USER_ID = "22222222-2222-4222-a222-222222222222";
const DRIVER_ID = "33333333-3333-4333-a333-333333333333"; // drivers.id
const DRIVER_USER_ID = "44444444-4444-4444-a444-444444444444"; // users.id
const STRANGER_USER_ID = "55555555-5555-4555-a555-555555555555";
const ADMIN_USER_ID = "99999999-9999-4999-a999-999999999999";

const RIDE_ROW = {
  id: RIDE_ID,
  user_id: RIDER_USER_ID,
  driver_id: DRIVER_ID,
  status: "completed",
};

const SAMPLE_POINTS = [
  { lat: 23.8103, lng: 90.4125, ts: 1730550000000 },
  { lat: 23.8153, lng: 90.4175, ts: 1730550300000 },
  { lat: 23.8203, lng: 90.4225, ts: 1730550600000 },
];

function queuedSelects(rows: unknown[][]) {
  let i = 0;
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows[i++] ?? []).then(res, rej);
    return c;
  };
  (db.select as jest.Mock).mockImplementation(() => chain());
}

function getRequest(): Request {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "authorization" ? "Bearer valid-token" : null) },
    url: "http://localhost/",
  } as unknown as Request;
}

describe("GET /api/ride/[id]/breadcrumbs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "sup-user" });
  });

  it("returns 400 for invalid uuid", async () => {
    const res = await GET(getRequest(), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_uuid");
  });

  it("returns 401 when token verification fails", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValueOnce({ status: 401, message: "Unauthorized" });
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 404 when user is not found in database", async () => {
    queuedSelects([[]]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("user_not_found");
  });

  it("returns 404 when ride is not found", async () => {
    queuedSelects([
      [{ id: RIDER_USER_ID, role: "rider" }], // user query
      [], // ride query empty
    ]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("ride_not_found");
  });

  it("returns 403 when user is neither rider, driver, nor admin (IDOR protection)", async () => {
    queuedSelects([
      [{ id: STRANGER_USER_ID, role: "rider" }], // stranger
      [RIDE_ROW], // ride
      [{ user_id: DRIVER_USER_ID }], // driver resolution
    ]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_ride_participant");
  });

  it("returns 200 with route breadcrumbs for the rider participant", async () => {
    queuedSelects([
      [{ id: RIDER_USER_ID, role: "rider" }], // user is rider
      [RIDE_ROW], // ride
      [{ user_id: DRIVER_USER_ID }], // driver resolution
      [{
        points: SAMPLE_POINTS,
        duration_seconds: 600,
        distance_meters: "2500.50",
      }], // rideRoutes query
    ]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ride_id: RIDE_ID,
      points: SAMPLE_POINTS,
      duration_seconds: 600,
      distance_meters: 2500.5,
    });
  });

  it("returns 200 with route breadcrumbs for the driver participant", async () => {
    queuedSelects([
      [{ id: DRIVER_USER_ID, role: "driver" }], // user is driver
      [RIDE_ROW], // ride
      [{ user_id: DRIVER_USER_ID }], // driver resolution
      [{
        points: SAMPLE_POINTS,
        duration_seconds: 600,
        distance_meters: "2500.50",
      }], // rideRoutes query
    ]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ride_id: RIDE_ID,
      points: SAMPLE_POINTS,
      duration_seconds: 600,
      distance_meters: 2500.5,
    });
  });

  it("returns 200 for an admin user even if not participant", async () => {
    queuedSelects([
      [{ id: ADMIN_USER_ID, role: "admin" }], // user is admin
      [RIDE_ROW], // ride
      [{ user_id: DRIVER_USER_ID }], // driver resolution
      [{
        points: SAMPLE_POINTS,
        duration_seconds: 600,
        distance_meters: "2500.50",
      }], // rideRoutes query
    ]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.points).toHaveLength(3);
  });

  it("returns empty points array when no route record exists yet", async () => {
    queuedSelects([
      [{ id: RIDER_USER_ID, role: "rider" }], // user
      [RIDE_ROW], // ride
      [{ user_id: DRIVER_USER_ID }], // driver resolution
      [], // no ride_routes record
    ]);
    const res = await GET(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ride_id: RIDE_ID,
      points: [],
      duration_seconds: 0,
      distance_meters: null,
    });
  });
});
