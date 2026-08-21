/**
 * Regression tests for the F-15 real-time SOS broadcast seam:
 *  - a NEW alert insert triggers exactly one internal push to the WS server
 *    (`/internal/sos/alert`) with the Bearer internal secret and the wire
 *    payload shape (string lat/lng, ISO created_at)
 *  - the per-ride dedupe short-circuit does NOT push (the alert is already
 *    on the admin dashboard) and does NOT insert
 *  - a WS push failure (network/timeout) is non-fatal — the route still
 *    returns { ok: true } so the user's SOS request never fails because of
 *    the dispatch server
 *
 * verifySupabaseToken and the DB are mocked; parseJsonBody (real) is driven
 * by a fake Request whose json() returns the SOS body — same seam as
 * chatMessage.test.ts.
 */
/* eslint-disable import/first */
jest.mock("../auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));
// The route reads its SOS cooldown from platform_config (never cached).
// This suite tests the broadcast seam, not config parsing — pin the default
// 15-minute window and keep the config query out of the db mock.
jest.mock("../platformConfig", () => ({
  getPlan05Int: jest.fn(async () => 900),
}));

import { db } from "../../src/db";
import { users, rides, sosAlerts } from "../../src/db/schema";
import { verifySupabaseToken } from "../auth";
import { POST } from "../../app/api/sos/alert+api";

const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const ALERT_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = new Date("2026-01-01T00:00:00Z");

// Responses keyed by table identity (real schema objects).
const BY_TABLE = new Map<unknown, Record<string, unknown>[]>();

beforeEach(() => {
  BY_TABLE.clear();
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-uid-1" });

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      const rows = () => BY_TABLE.get(table) ?? [];
      return {
        // The chain object is ALSO promise-like: some routes await the
        // where() result directly (no limit/orderBy — e.g. the emergency
        // contacts query), which must resolve to the rows.
        where: jest.fn(() => {
          const rowsNow = rows();
          const chain = {
            limit: jest.fn(async (n: number) => rowsNow.slice(0, n)),
            // The cooldown probe orders by created_at before limiting.
            orderBy: jest.fn(() => ({
              limit: jest.fn(async (n: number) => rowsNow.slice(0, n)),
            })),
          };
          return {
            ...chain,
            then: (resolve: (v: unknown) => void) => resolve(rowsNow),
          };
        }),
      };
    }),
  }));

  (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
    values: jest.fn((values: Record<string, unknown>) => ({
      returning: jest.fn(async () => [{ ...values, id: ALERT_ID, created_at: CREATED_AT }]),
    })),
  }));
});

function sosRequest(body: Record<string, unknown>): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

describe("sos/alert — F-15 real-time admin broadcast", () => {
  test("a new insert pushes exactly one alert to /internal/sos/alert with the wire shape", async () => {
    process.env.WEBSOCKET_INTERNAL_SECRET = "s".repeat(32);
    const originalFetch = (global as unknown as { fetch: unknown }).fetch;
    const fetchMock = jest.fn(async () => ({ ok: true })) as jest.Mock;
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    try {
      BY_TABLE.set(users, [{ id: "rider-user-1", role: "rider" }]);

      const res = await POST(sosRequest({ lat: 23.8, lng: 90.4 }));
      // 201 = new alert created (route contract: dedupe returns 200).
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ ok: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:3001/internal/sos/alert");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe(`Bearer ${"s".repeat(32)}`);
      expect(init.signal).toBeDefined();
      const body = JSON.parse(init.body);
      expect(body.alert).toMatchObject({
        id: ALERT_ID,
        user_id: "rider-user-1",
        role: "rider",
        latitude: "23.8",
        longitude: "90.4",
        message: "Rider SOS alert",
        ride_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      });
    } finally {
      (global as unknown as { fetch: unknown }).fetch = originalFetch;
      delete process.env.WEBSOCKET_INTERNAL_SECRET;
    }
  });

  test("the dedupe path does NOT insert or push — the alert is already on the dashboard", async () => {
    process.env.WEBSOCKET_INTERNAL_SECRET = "s".repeat(32);
    const originalFetch = (global as unknown as { fetch: unknown }).fetch;
    const fetchMock = jest.fn(async () => ({ ok: true })) as jest.Mock;
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    try {
      BY_TABLE.set(users, [{ id: "rider-user-1", role: "rider" }]);
      BY_TABLE.set(rides, [{ id: RIDE_ID, user_id: "rider-user-1", driver_id: null }]);
      BY_TABLE.set(sosAlerts, [{ id: "existing-open-alert" }]);

      const res = await POST(sosRequest({ lat: 23.8, lng: 90.4, ride_id: RIDE_ID }));
      expect(res.status).toBe(200);
      // toMatchObject: the cooldown-aware route also echoes alert_id of the
      // kept alert — the behavioral contract here is dedupe + silence.
      expect(await res.json()).toMatchObject({ ok: true, deduped: true });

      expect(db.insert).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      (global as unknown as { fetch: unknown }).fetch = originalFetch;
      delete process.env.WEBSOCKET_INTERNAL_SECRET;
    }
  });

  test("a WS push failure is non-fatal — the route still returns { ok: true }", async () => {
    process.env.WEBSOCKET_INTERNAL_SECRET = "s".repeat(32);
    const originalFetch = (global as unknown as { fetch: unknown }).fetch;
    const fetchMock = jest.fn(async () => {
      throw new Error("connection refused");
    }) as jest.Mock;
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    try {
      BY_TABLE.set(users, [{ id: "rider-user-1", role: "rider" }]);

      const res = await POST(sosRequest({ lat: 23.8, lng: 90.4 }));
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      (global as unknown as { fetch: unknown }).fetch = originalFetch;
      delete process.env.WEBSOCKET_INTERNAL_SECRET;
    }
  });
});
