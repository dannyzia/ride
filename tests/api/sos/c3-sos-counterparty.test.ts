/* eslint-disable import/first */
/**
 * C3-7 (STAGE C3-FIX): SOS counterparty fan-out.
 *  - rider SOS with ride → driver gets exactly one targeted push
 *    (sos:counterparty, rider-emergency copy); WS leg carries the ride.
 *  - driver SOS with ride → ownership PASSES (drivers.id resolved via
 *    lib/rideParticipants — the C3-1 class fix; direct comparison 403'd
 *    every driver) and the rider gets the safe-exit push.
 *  - fan-out is never batched: self/admin/counterparty pushes each address
 *    exactly one user id; each emergency contact gets an individual SMS.
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supabase-uid-1" })),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => undefined),
}));
jest.mock("@/lib/dprelay", () => ({
  sendSmsSos: jest.fn(async () => true),
}));

import { db } from "@/src/db";
import { sendNotification } from "@/lib/notify";
import { sendSmsSos } from "@/lib/dprelay";
import { POST as sosAlert } from "@/app/api/sos/alert+api";

const RIDE_ID = "11111111-1111-4111-a111-111111111111";
const RIDER_USER = "22222222-2222-4222-8222-222222222222";
const DRIVER_USER = "33333333-3333-4333-8333-333333333333";
const DRIVER_ROW = "44444444-4444-4444-8444-444444444444";
const ADMIN_USER = "55555555-5555-4555-8555-555555555555";
const ALERT_ID = "66666666-6666-4666-8666-666666666666";

const INSERTED = {
  id: ALERT_ID,
  user_id: RIDER_USER,
  role: "rider",
  latitude: "23.8103",
  longitude: "90.4125",
  message: "Rider SOS alert",
  ride_id: RIDE_ID,
  created_at: new Date("2026-10-16T10:00:00Z"),
};

// Select order in the route: user → ride → drivers lookup (participant
// resolution) → existing-open dedupe → admin → contacts (terminal where,
// no limit — hence the thenable).
function queuedSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const next = () => rows[i++] ?? [];
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => ({
      limit: async () => next(),
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(next()).then(res, rej),
    });
    return c;
  });
}

function mockInsertReturning(row: unknown) {
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: () => ({ returning: async () => [row] }),
  }));
  (db.update as jest.Mock).mockImplementation(() => ({
    set: () => ({ where: async () => undefined }),
  }));
}

function postRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
    url: "http://localhost/",
  } as unknown as Request;
}

function pushTargets(): Array<{ to: unknown; type: unknown; body: unknown }> {
  return (sendNotification as jest.Mock).mock.calls.map((c) => ({
    to: c[0],
    type: c[1],
    body: c[3],
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  // The /internal/sos/alert leg is gated on WEBSOCKET_INTERNAL_SECRET.
  process.env.WEBSOCKET_INTERNAL_SECRET = "test-secret";
  (globalThis as Record<string, unknown>).fetch = jest.fn(async () => ({ ok: true }));
  if (typeof (AbortSignal as unknown as Record<string, unknown>).timeout !== "function") {
    (AbortSignal as unknown as Record<string, unknown>).timeout = () => undefined;
  }
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).fetch;
  delete process.env.WEBSOCKET_INTERNAL_SECRET;
});

describe("POST /api/sos/alert (C3-7 counterparty fan-out)", () => {
  it("rider SOS fans out to exactly the driver (plus self, admin, contacts — never batched)", async () => {
    queuedSelects([
      [{ id: RIDER_USER, role: "rider", name: "Rina" }],
      [{ user_id: RIDER_USER, driver_id: DRIVER_ROW }],
      [{ user_id: DRIVER_USER }],
      [],
      [{ id: ADMIN_USER }],
      [
        { phone: "+8801711111111", name: "Amma" },
        { phone: "+8801722222222", name: "Bhai" },
      ],
    ]);
    mockInsertReturning(INSERTED);

    const res = await sosAlert(postRequest({ lat: 23.8103, lng: 90.4125, ride_id: RIDE_ID }));
    expect(res.status).toBe(201);

    // Three pushes, each addressed to exactly one user id.
    expect(sendNotification).toHaveBeenCalledTimes(3);
    const targets = pushTargets();
    for (const t of targets) expect(typeof t.to).toBe("string");
    expect(targets).toContainEqual(expect.objectContaining({ to: RIDER_USER, type: "sos:alert" }));
    expect(targets).toContainEqual(expect.objectContaining({ to: ADMIN_USER, type: "sos:admin_alert" }));
    const driverPush = targets.find((t) => t.to === DRIVER_USER);
    expect(driverPush?.type).toBe("sos:counterparty");
    expect(String(driverPush?.body)).toContain("ride chat");

    // One SMS per contact — individual sends, never a batch call.
    expect(sendSmsSos).toHaveBeenCalledTimes(2);
    expect((sendSmsSos as jest.Mock).mock.calls[0][0]).toBe("+8801711111111");
    expect((sendSmsSos as jest.Mock).mock.calls[1][0]).toBe("+8801722222222");

    // One internal WS call carrying the ride for the counterparty leg.
    const fetchMock = (globalThis as Record<string, unknown>).fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const wsBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(wsBody.alert.ride_id).toBe(RIDE_ID);
    expect(wsBody.alert.role).toBe("rider");
  });

  it("driver SOS passes ride ownership and safe-exits the rider", async () => {
    queuedSelects([
      [{ id: DRIVER_USER, role: "driver", name: "Kamal" }],
      [{ user_id: RIDER_USER, driver_id: DRIVER_ROW }],
      [{ user_id: DRIVER_USER }],
      [],
      [{ id: ADMIN_USER }],
      [],
    ]);
    mockInsertReturning({ ...INSERTED, user_id: DRIVER_USER, role: "driver", message: "Driver SOS alert" });

    const res = await sosAlert(postRequest({ lat: 23.8, lng: 90.4, ride_id: RIDE_ID }));
    // The old direct `ride.driver_id === dbUser.id` comparison 403'd here
    // (drivers.id vs users.id) — the C3-1 class fix lets it through.
    expect(res.status).toBe(201);

    const targets = pushTargets();
    const riderPush = targets.find((t) => t.to === RIDER_USER);
    expect(riderPush?.type).toBe("sos:counterparty");
    expect(String(riderPush?.body)).toContain("exit the vehicle");
  });

  it("SOS without ride context still notifies self + admin, no counterparty", async () => {
    queuedSelects([
      [{ id: RIDER_USER, role: "rider", name: "Rina" }],
      [{ id: ADMIN_USER }],
      [],
    ]);
    mockInsertReturning({ ...INSERTED, ride_id: null });

    const res = await sosAlert(postRequest({ lat: 23.8, lng: 90.4 }));
    expect(res.status).toBe(201);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(pushTargets().map((t) => t.type).sort()).toEqual(["sos:admin_alert", "sos:alert"]);
  });

  it("stranger SOS with ride context is still rejected", async () => {
    queuedSelects([
      [{ id: "stranger-user", role: "rider", name: "X" }],
      [{ user_id: RIDER_USER, driver_id: DRIVER_ROW }],
      [{ user_id: DRIVER_USER }],
    ]);
    const res = await sosAlert(postRequest({ lat: 23.8, lng: 90.4, ride_id: RIDE_ID }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("not_your_ride");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
