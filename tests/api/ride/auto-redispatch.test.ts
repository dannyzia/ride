/**
 * R3.3 auto-redispatch — cancel-route gating tests (design §10, locked
 * 2026-09-03 with Amendments 1+2 folded in; execution order
 * .kilo/plans/r3-completion-revert-and-reland.md).
 *
 * Mock-chain pattern per tests/api/ride/pickup-move.test.ts. Real handler
 * (POST as cancelRide); db/auth/notify/platformConfig and the fee deps
 * (cancellation/accounting/cancellationCompensation/paymentEvents) mocked.
 *
 * Covered here:
 * - gating: enabled+under-cap / attempts-exhausted / flag-off / scheduled_at
 * - claim UPDATE shape (status, cancelled_by null, driver_id null, stamps)
 * - /internal/ride/cancelled body contract (redispatch + rider_user_id)
 * - notifications: ride:driver_cancelled vs ride:cancel_survey
 * - Amendment 2 bidirectional zero-fee gate
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/cancellation", () => ({
  evaluateCancellation: jest.fn(),
}));
jest.mock("@/lib/accounting", () => ({
  recordCancellationFee: jest.fn(),
}));
jest.mock("@/lib/cancellationCompensation", () => ({
  createCancellationCreditInTx: jest.fn(),
}));
jest.mock("@/lib/paymentEvents", () => ({
  createCancellationFeeEventInTx: jest.fn(),
}));
jest.mock("@/lib/hotspots", () => ({
  haversineKm: jest.fn(() => 5),
}));
jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Int: jest.fn(),
  getConfigValue: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { evaluateCancellation } from "@/lib/cancellation";
import { recordCancellationFee } from "@/lib/accounting";
import { createCancellationCreditInTx } from "@/lib/cancellationCompensation";
import { createCancellationFeeEventInTx } from "@/lib/paymentEvents";
import { sendNotification } from "@/lib/notify";
import { getPlan05Int, getConfigValue } from "@/lib/platformConfig";
import { POST as cancelRide } from "@/app/api/ride/[id]/cancel+api";

const RIDER_USER_ID = "11111111-1111-4111-a111-111111111111";
const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const DB_DRIVER_USER_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";
const T0 = new Date("2026-08-25T02:00:00.000Z");

type Row = Record<string, unknown>;

function jsonRequest(body: unknown, auth = "bearer token"): Request {
  return {
    json: async () => body,
    headers: { get: () => auth },
  } as unknown as Request;
}

function getJson(res: Response): Promise<Row> {
  return res.json() as Promise<Row>;
}

/** Queue-based db.select mock (users → ride → drivers-ownership → driver-position). */
function mockSelectQueue(queue: Row[][]) {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
        })),
      })),
    };
  });
}

interface TxState {
  updates: { setValues: Row | null }[];
  inserts: Row[];
}

/**
 * tx mock supporting the cancel transaction's shape: claim UPDATE (returning
 * claimRows), optional fee-stamp UPDATE, driver-free UPDATE, compensation
 * credit, riderFeeDeductions INSERT.
 */
function mockTransaction(claimRows: Row[]): TxState {
  const state: TxState = { updates: [], inserts: [] };
  let updateCalls = 0;
  const tx = {
    update: jest.fn(() => {
      const u: { setValues: Row | null } = { setValues: null };
      state.updates.push(u);
      const isClaim = updateCalls++ === 0;
      return {
        set: jest.fn((v: Row) => {
          u.setValues = v;
          return {
            where: jest.fn(() => ({
              returning: jest.fn(async () => (isClaim ? claimRows : [{ id: "x" }])),
            })),
          };
        }),
      };
    }),
    insert: jest.fn(() => ({
      values: jest.fn((v: Row) => {
        state.inserts.push(v);
        return {
          returning: jest.fn(async () => [{ id: "inserted-1" }]),
        };
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: unknown) => Promise<void>) => cb(tx),
  );
  return state;
}

function rideRow(overrides: Row = {}): Row {
  return {
    id: RIDE_ID,
    user_id: RIDER_USER_ID,
    driver_id: DRIVER_ID,
    status: "matched",
    created_at: T0,
    pickup_requoted_at: null,
    scheduled_at: null,
    redispatch_attempts: 0,
    zone_id: "55555555-5555-4555-8555-555555555555",
    ...overrides,
  };
}

/** Standard driver-cancel select queue: user, ride, drivers-ownership, driver-position. */
function mockDriverCancelSelects(ride: Row) {
  mockSelectQueue([
    [{ id: DB_DRIVER_USER_ID, role: "driver" }],
    [ride],
    [{ id: DRIVER_ID }],
    [{ last_location_lat: "23.78", last_location_lng: "90.4" }],
  ]);
}

const fetchMock = jest.fn(() => Promise.resolve({ ok: true } as Response));

function lastFetchBody(): Row {
  const calls = fetchMock.mock.calls as unknown as [string, { body: string }][];
  const call = calls[calls.length - 1];
  return JSON.parse(String((call?.[1] as { body: string }).body));
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-driver-1" });
  (evaluateCancellation as jest.Mock).mockResolvedValue({
    feeBdt: 0,
    reason: "within_grace_period",
  });
  (getPlan05Int as jest.Mock).mockImplementation(
    async (_key: string, fallback: number) => fallback,
  );
  (getConfigValue as jest.Mock).mockImplementation(
    async (_key: string, fallback: string) => fallback,
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.WEBSOCKET_INTERNAL_SECRET = "test-secret-min-32-characters-long!!";
  process.env.UTILS_SERVER_PORT = "3999";
});

afterAll(() => {
  delete process.env.WEBSOCKET_INTERNAL_SECRET;
  delete process.env.UTILS_SERVER_PORT;
});

describe("driver cancel — auto-redispatch gating", () => {
  test("enabled + under cap: dispatching, driver cleared, window stamped, attempts incremented", async () => {
    (getConfigValue as jest.Mock).mockResolvedValue("true"); // auto_redispatch_enabled
    mockDriverCancelSelects(rideRow({ redispatch_attempts: 1 }));
    const state = mockTransaction([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({ reason: "vehicle broke" }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, status: "dispatching" });

    // The claim UPDATE carries the full R3.3 shape (design §1/§7)
    const claim = state.updates[0].setValues ?? {};
    expect(claim.status).toBe("dispatching");
    expect(claim.cancelled_by).toBeNull();
    expect(claim.cancel_reason).toBeNull();
    expect(claim.driver_id).toBeNull();
    expect(claim.redispatch_started_at).toEqual(expect.any(Date));
    // attempts increment via sql`... + 1` — present and not a plain number
    expect(claim).toHaveProperty("redispatch_attempts");
    expect(claim.driver_cancel_within_200m).toBeUndefined();

    // The departing driver still gets their normal cancel confirmation
    expect(lastFetchBody()).toMatchObject({ ride_id: RIDE_ID, driver_id: DRIVER_ID });
  });

  test("attempts exhausted (3 >= max 3): status expired, NOT cancelled, NOT dispatching", async () => {
    (getConfigValue as jest.Mock).mockResolvedValue("true");
    (getPlan05Int as jest.Mock).mockImplementation(
      async (key: string, fallback: number) =>
        key === "auto_redispatch_max_attempts" ? 3 : fallback,
    );
    mockDriverCancelSelects(rideRow({ redispatch_attempts: 3 }));
    const state = mockTransaction([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);

    const claim = state.updates[0].setValues ?? {};
    expect(claim.status).toBe("expired");
    expect(claim.status).not.toBe("dispatching");
    expect(claim).not.toHaveProperty("redispatch_started_at");
    // attempts NOT incremented on the exhausted path
    expect(claim).not.toHaveProperty("redispatch_attempts");
  });

  test("flag off: legacy cancelled path unchanged, config still consulted", async () => {
    (getConfigValue as jest.Mock).mockResolvedValue("false");
    mockDriverCancelSelects(rideRow());
    const state = mockTransaction([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, status: "cancelled" });

    const claim = state.updates[0].setValues ?? {};
    expect(claim.status).toBe("cancelled");
    expect(claim.cancelled_by).toBe("driver");
    expect(getConfigValue).toHaveBeenCalledWith("auto_redispatch_enabled", "false");
  });

  test("scheduled ride: always cancelled regardless of the flag, cancel_survey sent", async () => {
    (getConfigValue as jest.Mock).mockResolvedValue("true");
    mockDriverCancelSelects(rideRow({ scheduled_at: new Date("2026-09-01T10:00:00Z") }));
    const state = mockTransaction([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);

    const claim = state.updates[0].setValues ?? {};
    expect(claim.status).toBe("cancelled");
    expect(claim).not.toHaveProperty("redispatch_started_at");
    // the re-land still consults the flag before excluding scheduled rides
    expect(getConfigValue).toHaveBeenCalledWith("auto_redispatch_enabled", "false");
    expect(sendNotification).toHaveBeenCalledWith(
      RIDER_USER_ID,
      "ride:cancel_survey",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ ride_id: RIDE_ID }),
    );
  });

  test("posts to /internal/ride/cancelled with redispatch:true and rider_user_id on the redispatch gate", async () => {
    (getConfigValue as jest.Mock).mockResolvedValue("true");
    mockDriverCancelSelects(rideRow());
    mockTransaction([{ id: RIDE_ID }]);

    await cancelRide(jsonRequest({}), { id: RIDE_ID });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3999/internal/ride/cancelled",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret-min-32-characters-long!!",
        }),
      }),
    );
    expect(lastFetchBody()).toMatchObject({
      ride_id: RIDE_ID,
      driver_id: DRIVER_ID,
      redispatch: true,
      rider_user_id: RIDER_USER_ID,
    });
  });

  test("notifications: ride:driver_cancelled (high) on redispatch, ride:cancel_survey on legacy", async () => {
    // Redispatch branch
    (getConfigValue as jest.Mock).mockResolvedValue("true");
    mockDriverCancelSelects(rideRow());
    mockTransaction([{ id: RIDE_ID }]);
    await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(sendNotification).toHaveBeenCalledWith(
      RIDER_USER_ID,
      "ride:driver_cancelled",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ ride_id: RIDE_ID }),
      expect.objectContaining({ priority: "high" }),
    );

    // Legacy branch
    jest.clearAllMocks();
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-driver-1" });
    (evaluateCancellation as jest.Mock).mockResolvedValue({ feeBdt: 0, reason: "x" });
    (getConfigValue as jest.Mock).mockResolvedValue("false");
    mockDriverCancelSelects(rideRow());
    mockTransaction([{ id: RIDE_ID }]);
    await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(sendNotification).toHaveBeenCalledWith(
      RIDER_USER_ID,
      "ride:cancel_survey",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ ride_id: RIDE_ID }),
    );
  });

  test("Amendment 2 bidirectional: zero fee writes on redispatch; fee block intact on legacy", async () => {
    // ── redispatch path: the fee deps are NEVER invoked ──
    (getConfigValue as jest.Mock).mockResolvedValue("true");
    mockDriverCancelSelects(rideRow());
    const redispatchState = mockTransaction([{ id: RIDE_ID }]);

    await cancelRide(jsonRequest({}), { id: RIDE_ID });

    expect(evaluateCancellation).not.toHaveBeenCalled();
    expect(createCancellationCreditInTx).not.toHaveBeenCalled();
    expect(createCancellationFeeEventInTx).not.toHaveBeenCalled();
    expect(recordCancellationFee).not.toHaveBeenCalled();
    expect(redispatchState.inserts).toHaveLength(0); // no riderFeeDeductions row
    for (const u of redispatchState.updates) {
      expect(u.setValues).not.toHaveProperty("cancellation_fee_bdt");
      expect(u.setValues).not.toHaveProperty("cancellation_fee_pending");
    }

    // ── legacy driver-cancel path (feeBdt>0): the fee block still runs ──
    jest.clearAllMocks();
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-driver-1" });
    (evaluateCancellation as jest.Mock).mockResolvedValue({ feeBdt: 5000, reason: "policy" });
    (getConfigValue as jest.Mock).mockResolvedValue("false");
    mockDriverCancelSelects(rideRow());
    const legacyState = mockTransaction([{ id: RIDE_ID }]);

    await cancelRide(jsonRequest({}), { id: RIDE_ID });

    expect(evaluateCancellation).toHaveBeenCalledTimes(1);
    // fee stamp rides in its own tx update
    const stamp = legacyState.updates.find((u) => u.setValues?.cancellation_fee_bdt != null);
    expect(stamp).toBeDefined();
    expect(stamp!.setValues).toMatchObject({
      cancellation_fee_bdt: 5000,
      cancellation_compensation_driver_id: DRIVER_ID,
      cancellation_fee_pending: true,
    });
    expect(createCancellationCreditInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ originalDriverId: DRIVER_ID, amountBdt: 5000 }),
    );
    expect(legacyState.inserts).toHaveLength(1);
    expect(legacyState.inserts[0]).toMatchObject({
      rider_id: RIDER_USER_ID,
      ride_id: RIDE_ID,
      total_amount_bdt: 5000,
      remaining_amount_bdt: 5000,
    });
    expect(createCancellationFeeEventInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rideId: RIDE_ID, riderId: RIDER_USER_ID, amountBdt: 5000 }),
    );
    expect(recordCancellationFee).toHaveBeenCalledWith(
      expect.objectContaining({ id: RIDE_ID, feePaisa: 5000, riderId: RIDER_USER_ID }),
    );
  });
});
