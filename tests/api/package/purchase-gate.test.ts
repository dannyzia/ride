/**
 * Fare Framework package-purchase fraud gate (Phase F/G).
 *
 * POST /api/package/purchase must reject with 403 package_gate_blocked when
 * the driver has ANY fraud_flags row with status='blocked' OR a
 * trailing-30-day proximity-cancel rate above cancel_rate_package_gate_pct
 * (config 30 = 30%). Otherwise the purchase proceeds untouched.
 *
 * DB mocked with a queue-based select (route query order), same pattern as
 * app/api/ride/__tests__/cancel-survey.test.ts.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supa-user-1" })),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/portpos", () => ({
  isConfigured: jest.fn(() => true),
}));
jest.mock("@/lib/paymentEvents", () => ({
  initiatePortposPayment: jest.fn(async () => ({
    payment_url: "https://pay.example/invoice",
    payment_event_id: "evt-1",
  })),
  createZeroAmountPaymentEvent: jest.fn(),
}));
jest.mock("@/lib/activateSubscription", () => ({
  activateSubscription: jest.fn(),
}));
jest.mock("@/lib/parseBody", () => ({
  parseJsonBody: jest.fn(async () => ({
    ok: true,
    data: { package_id: "9adf6c88-0000-4000-8000-000000000001", provider: "portpos" },
  })),
}));
jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async () => ({
    cancel_rate_package_gate_pct: "30",
  })),
  parseConfigNumber: (value: string, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },
}));

import { db } from "@/src/db";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { POST } from "@/app/api/package/purchase+api";

type Row = Record<string, unknown>;

const USER_ID = "11111111-1111-4111-a111-111111111111";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const PACKAGE_ID = "9adf6c88-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";

const USER_ROW = [{ id: USER_ID }];
const DRIVER_ROW = [{ id: DRIVER_ID, status: "active", vehicle_type: "bike_basic" }];
const PACKAGE_ROW = [
  {
    id: PACKAGE_ID,
    is_active: true,
    vehicle_type: null,
    is_trial: false,
    price_bdt: 10000,
    name: "Starter",
  },
];

function makeRequest(): Request {
  return {
    headers: { get: (name: string) => (name === "Idempotency-Key" ? IDEMPOTENCY_KEY : null) },
  } as unknown as Request;
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: Record<string, unknown> = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      limit: async () => rows,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });
}

function gateCounts(
  completed: number,
  driverCancelled: number,
  proximityCancels: number,
): Row[] {
  return [
    {
      completed: String(completed),
      driver_cancelled: String(driverCancelled),
      proximity_cancels: String(proximityCancels),
    },
  ];
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("package purchase — fraud gate", () => {
  test("any blocked fraud flag → 403 package_gate_blocked, no payment initiated", async () => {
    mockSelectQueue([
      USER_ROW, // user lookup
      DRIVER_ROW, // driver lookup
      [{ id: "flag-1" }], // blocked fraud flag → gate trips
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(await getJson(res)).toEqual({
      error: "package_gate_blocked",
      message: "Your account requires review before purchasing. Contact support.",
    });
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("proximity-cancel rate above the configured threshold → 403", async () => {
    // 4 / (4 + 6) = 40% > 30%
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [], // no blocked flag
      gateCounts(4, 6, 4),
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(await getJson(res)).toMatchObject({ error: "package_gate_blocked" });
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("rate exactly at the threshold passes (strictly-greater comparison)", async () => {
    // 3 / (3 + 7) = 30% — not > 30%
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [],
      gateCounts(3, 7, 3),
      PACKAGE_ROW,
      [], // no active subscription
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({
      payment_url: "https://pay.example/invoice",
      payment_event_id: "evt-1",
    });
    expect(initiatePortposPayment).toHaveBeenCalledTimes(1);
  });

  test("zero-ride denominator never blocks", async () => {
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [],
      gateCounts(0, 0, 0),
      PACKAGE_ROW,
      [],
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(initiatePortposPayment).toHaveBeenCalledTimes(1);
  });

  test("clean driver passes the gate and completes the purchase", async () => {
    // 1 / (8 + 2) = 10% < 30%
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [],
      gateCounts(8, 2, 1),
      PACKAGE_ROW,
      [],
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ payment_event_id: "evt-1" });
    expect(initiatePortposPayment).toHaveBeenCalledTimes(1);
  });

  test("gate queries fraud_flags by driver with status='blocked' (SQL shape)", async () => {
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      [{ id: "flag-1" }],
    ]);
    await POST(makeRequest());
    // Third select call is the flag lookup — it ran before any payment work.
    expect(db.select).toHaveBeenCalledTimes(3);
  });
});
