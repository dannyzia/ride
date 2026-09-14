// @ts-nocheck — Jest mock factories produce untyped auth/logger chains; runtime
// behavior is what's under test (house pattern: tests/api/delivery/f37-lock.test.ts).
/**
 * Batch 6 (Barikoi optimization plan) — POST /api/navigation/route v1 → v2 migration.
 *
 * Pins the CLIENT CONTRACT across the engine swap:
 *   { route: { duration_seconds, distance_meters, geometry, steps: {instruction, distance}[] } }
 *
 * The old v1 distance/directions endpoint is dead (404 HTML — probe artifact
 * 2026-09-14, .kilo/plans/active-lanes.md). v2 is OSRM-shaped:
 *   { code: 'Ok', routes: [{ duration, distance, geometry (GeoJSON, geometries=geojson),
 *     legs: [{ steps: [{ maneuver: { instruction }, distance }] }] }] }
 *
 * geometry MUST stay a GeoJSON object — DriverNavigation feeds it straight into
 * MapLibre ShapeSource.shape (plan D-D: a polyline string silently breaks the
 * route line). steps MUST stay instruction-grade (FEATURES.md row 25).
 * Server-side key BARIKOI_API_KEY replaces the EXPO_PUBLIC_ leak (Batch 6.1).
 */
import { POST as handler } from "@/app/api/navigation/route+api";
import { verifySupabaseToken } from "@/lib/auth";

const mockFetch = jest.fn();
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "00000000-0000-4000-8000-0000000000u1" })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("global/process", () => process, { virtual: true });
const realEnv = process.env;
beforeEach(() => {
  // NO jest.resetModules here — the handler imported at top holds the mocked
  // @/lib/auth instance; re-evaluating modules would sever that wiring.
  // process.env.BARIKOI_API_KEY is read inside POST at call time, so setting
  // it directly is sufficient.
  process.env = { ...realEnv, BARIKOI_API_KEY: "bkoi_test_key", EXPO_PUBLIC_BARIKOI_API_KEY: "" };
});
afterEach(() => {
  process.env = realEnv;
  jest.clearAllMocks();
});

// global fetch is available in the jest node env; route it through the mock.
global.fetch = mockFetch;

const V2_OK = {
  code: "Ok",
  routes: [
    {
      duration: 276.8,
      distance: 973.6,
      geometry: { type: "LineString", coordinates: [[90.4078, 23.7925], [90.4117, 23.7975]] },
      legs: [
        {
          steps: [
            { maneuver: { instruction: "depart " }, distance: 49.1 },
            { maneuver: { instruction: "turn right onto Road 11" }, distance: 320.5 },
            { maneuver: { instruction: "arrive" }, distance: 0 },
          ],
        },
      ],
    },
  ],
};

const BODY = {
  waypoints: [
    { lat: 23.7925, lng: 90.4078 },
    { lat: 23.7975, lng: 90.4117 },
  ],
};

const req = (body: unknown) =>
  new Request("http://localhost/api/navigation/route", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify(body),
  });

describe("POST /api/navigation/route — v2 migration", () => {
  test("happy path: v2 routes[0] mapped onto the unchanged client contract", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => V2_OK });

    const res = await handler(req(BODY));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.route.duration_seconds).toBe(276.8);
    expect(body.route.distance_meters).toBe(973.6);
    // D-D: geometry is the GeoJSON OBJECT, not an encoded polyline string.
    expect(body.route.geometry).toEqual({
      type: "LineString",
      coordinates: [[90.4078, 23.7925], [90.4117, 23.7975]],
    });
    // steps mapped from legs[0].steps to {instruction, distance}
    expect(body.route.steps).toEqual([
      { instruction: "depart ", distance: 49.1 },
      { instruction: "turn right onto Road 11", distance: 320.5 },
      { instruction: "arrive", distance: 0 },
    ]);
  });

  test("calls v2 with geometries=geojson&steps=true and lng-first coordinates", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => V2_OK });
    await handler(req(BODY));

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("https://barikoi.xyz/v2/api/route/");
    expect(url).toContain("90.4078,23.7925;90.4117,23.7975"); // lng-first BOTH positions
    expect(url).toContain("geometries=geojson");
    expect(url).toContain("steps=true");
    expect(url).toContain("api_key=bkoi_test_key");
    expect(url).not.toContain("EXPO_PUBLIC");
  });

  test("v2 non-Ok response → 502 route_unavailable (no zero-filled fake route)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ code: "NoRoute", routes: [] }) });

    const res = await handler(req(BODY));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("route_unavailable");
  });

  test("v2 Ok but empty routes array → 502", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ code: "Ok", routes: [] }) });

    const res = await handler(req(BODY));
    expect(res.status).toBe(502);
  });

  test("steps missing maneuver/distance degrade to empty instruction / 0 (no throw)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            duration: 10,
            distance: 20,
            geometry: { type: "LineString", coordinates: [[1, 2]] },
            legs: [{ steps: [{}, { distance: 5 }, { maneuver: { instruction: "left" } }] }],
          },
        ],
      }),
    });

    const res = await handler(req(BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route.steps).toEqual([
      { instruction: "", distance: 0 },
      { instruction: "", distance: 5 },
      { instruction: "left", distance: 0 },
    ]);
  });

  test("auth failure → 401 (unchanged)", async () => {
    // getErrorStatus reads err.status (lib/errors.ts), not the message.
    const err = new Error("unauthorized");
    (err as unknown as { status: number }).status = 401;
    (verifySupabaseToken as jest.Mock).mockRejectedValueOnce(err);

    const res = await handler(req(BODY));
    expect(res.status).toBe(401);
  });

  test("uses BARIKOI_API_KEY, not the EXPO_PUBLIC_ variable (Batch 6.1 key fix)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => V2_OK });
    await handler(req(BODY));
    const [url] = mockFetch.mock.calls[0];
    // If the server-side key were missing we'd get config_missing 500 — the
    // URL carrying bkoi_test_key proves the non-public env var was read.
    expect(url).toContain("api_key=bkoi_test_key");
  });
});
