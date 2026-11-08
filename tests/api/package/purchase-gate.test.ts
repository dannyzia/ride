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
  db: {
    select: jest.fn(),
    // idempotency claim/outcome writes (lib/idempotency.ts) — fire-and-forget
    insert: jest.fn(() => ({ values: jest.fn(async () => undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
    // D3-B-r2 / postpaid lanes: driver_unpaid_obligations view reads (lib/commissionDues)
    execute: jest.fn(async () => []),
    // grant+bill tx (Item 16 postpaid lane) — executes the callback with a
    // pass-through tx whose inserts return a generated row id.
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: jest.fn(async () => []),
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
        insert: jest.fn(() => ({
          values: jest.fn(() => ({ returning: jest.fn(async () => [{ id: "new-row" }]) })),
        })),
      })),
  },
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
  // D3-B-r2 / Item 16 postpaid lane: grant-then-bill uses the shared lib fn.
  grantSubscriptionOnCredit: jest.fn(async () => ({
    subscriptionId: "sub-new",
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  })),
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

jest.mock("@/lib/launchRoles", () => ({
  heldRoles: jest.fn(async () => [{ role: "driver", status: "active" }]),
}));

// D9-2: money-movement master switch — ON here so the pre-existing gate
// tests exercise the fraud gate, not the payments gate.
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Bool: jest.fn(async () => true),
  getRevenueModel: jest.fn(async () => "subscription_only"),
}));

import { db } from "@/src/db";
import { initiatePortposPayment, createZeroAmountPaymentEvent } from "@/lib/paymentEvents";
import { getPlan05Bool, getRevenueModel } from "@/lib/platformConfig";
import { POST } from "@/app/api/package/purchase+api";

type Row = Record<string, unknown>;

const USER_ID = "11111111-1111-4111-a111-111111111111";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const PACKAGE_ID = "9adf6c88-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";
const BODY = { package_id: PACKAGE_ID, provider: "portpos" };

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
    roles: ["driver"],
  },
];

function makeRequest(): Request {
  return {
    headers: { get: (name: string) => (name === "Idempotency-Key" ? IDEMPOTENCY_KEY : null) },
    text: async () => JSON.stringify(BODY),
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
  // Pin the payments master switch ON (same anti-poisoning rationale as
  // tests/api/rider/passes.test.ts: a non-consuming OFF setup must never
  // leak into the next test's gate read).
  (getPlan05Bool as jest.Mock).mockResolvedValue(true);
});

describe("package purchase — fraud gate", () => {
  test("any blocked fraud flag → 403 package_gate_blocked, no payment initiated", async () => {
    mockSelectQueue([
      USER_ROW, // user lookup
      DRIVER_ROW, // driver lookup
      PACKAGE_ROW, // package load — BEFORE the gate (M-2 ordering)
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
      PACKAGE_ROW,
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
      PACKAGE_ROW,
      [],
      gateCounts(3, 7, 3),
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
      PACKAGE_ROW,
      [],
      gateCounts(0, 0, 0),
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
      PACKAGE_ROW,
      [],
      gateCounts(8, 2, 1),
      [],
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ payment_event_id: "evt-1" });
    expect(initiatePortposPayment).toHaveBeenCalledTimes(1);
  });

  test("D9-2: priced plan while payments_enabled=false → 409 payments_not_enabled, no payment initiated", async () => {
    (getPlan05Bool as jest.Mock).mockResolvedValueOnce(false);
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      PACKAGE_ROW,
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(await getJson(res)).toEqual({
      error: "payments_not_enabled",
      message: "Payments launch later — package purchase is not live yet",
    });
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("D9-2 FAULT: ৳0 trial bypasses the payments gate (launch_free keeps working)", async () => {
    // OFF — and the trial path must skip the gate entirely (Once would leak:
    // the gate is never reached for a ৳0 plan).
    (getPlan05Bool as jest.Mock).mockResolvedValue(false);
    (createZeroAmountPaymentEvent as jest.Mock).mockResolvedValueOnce({ id: "pe-trial" });
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      // Trial at ৳0 — the gate must not fire; the trial path activates directly.
      [{ id: PACKAGE_ROW[0].id, is_active: true, vehicle_type: null, is_trial: true, price_bdt: 0, name: "Trial", roles: ["driver"] }],
      [],
      gateCounts(0, 0, 0),
      [],
      [],
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ payment_event_id: "pe-trial", activated: true });
    expect(initiatePortposPayment).not.toHaveBeenCalled();
    expect(getPlan05Bool).not.toHaveBeenCalled();
  });

  test("gate queries fraud_flags by driver with status='blocked' (SQL shape)", async () => {
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      PACKAGE_ROW,
      [{ id: "flag-1" }],
    ]);
    await POST(makeRequest());
    // Fourth select call is the flag lookup — the fraud gate runs AFTER the
    // package load (M-2: role eligibility first, then the driver rail).
    expect(db.select).toHaveBeenCalledTimes(4);
  });

  // ── D3-B-r2: postpaid lane (hybrid + x-client-postpaid header) ────────────

  test("hybrid + x-client-postpaid: 1 + bundle package → postpaid lane, no checkout URL", async () => {
    (getRevenueModel as jest.Mock).mockResolvedValueOnce("hybrid");
    const bundleReq = {
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          if (lower === "x-client-postpaid") return "1";
          if (lower === "idempotency-key") return IDEMPOTENCY_KEY;
          return null;
        },
      },
      text: async () => JSON.stringify(BODY),
    } as unknown as Request;
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      PACKAGE_ROW, // package load — BEFORE the gate
      [], // no blocked fraud flag
      [], // no active subscription (narrowed usable-only check passes)
      [], // commission debt query — empty
      [], // grantSubscriptionOnCredit insert — no rows returned
      [], // createOpenBill insert — no rows returned
    ]);
    const res = await POST(bundleReq);

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.mode).toBe("subscription");
    expect(body.payment_url).toBeNull();
    expect(body.payment_event_id).toBeNull();
    expect(body.activated).toBe(true);
    // Rows generated inside the grant+bill tx (mocked grant lib fn + tx.insert returning mocks).
    expect(body.subscription).toMatchObject({ id: "sub-new" });
    expect(body.bill).toMatchObject({ id: "new-row" });
    expect(body.unfrozen).toBe(false);
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("hybrid + no x-client-postpaid header → legacy prepaid lane (invisible-debt protection)", async () => {
    (getRevenueModel as jest.Mock).mockResolvedValueOnce("hybrid");
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      PACKAGE_ROW,
      [],
      [],
      [], // grant + bill
      [],
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.mode).toBe("subscription");
    expect(body.payment_url).toBe("https://pay.example/invoice");
    expect(initiatePortposPayment).toHaveBeenCalledTimes(1);
  });

  // ── Batch-2 Item 1: operator applicability gate ──────────────────────────

  test("package whose applicable_roles excludes 'driver' → 403 package_not_applicable_to_role", async () => {
    mockSelectQueue([
      USER_ROW,
      DRIVER_ROW,
      // Shop-only plan: the §14 roles gate passes (roles: ["driver"]) so ONLY
      // the new operator-applicability gate can reject.
      [{ id: PACKAGE_ID, is_active: true, vehicle_type: null, is_trial: false, price_bdt: 10000, name: "Shop Plan", roles: ["driver"], applicable_roles: ["shop"] }],
      [], // no blocked fraud flag
      gateCounts(0, 0, 0),
      [], // no active subscription
    ]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(await getJson(res)).toEqual({
      error: "package_not_applicable_to_role",
      message: "This package is not available for your operator type",
    });
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });
});
