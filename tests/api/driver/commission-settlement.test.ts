/**
 * Commission & Hybrid Revenue Engine — driver dues surface.
 *
 * GET  /api/driver/dues      → net dues = accrued − settled, debt-ceiling state
 * POST /api/driver/dues/pay  → PortPos invoice for the outstanding balance
 *
 * The ledger math itself is lib/commissionDues.ts (exercised through the real
 * module here, against a mocked db) so the route tests pin the actual formula
 * rather than a stub.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
    insert: jest.fn(() => ({ values: jest.fn(async () => undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/paymentEvents", () => ({
  initiatePortposPayment: jest.fn(),
}));
jest.mock("@/lib/portpos", () => ({
  isConfigured: jest.fn(() => true),
}));
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Bool: jest.fn(async () => true),
  getRevenueModel: jest.fn(async () => "hybrid"),
  getMaxCommissionDebtBdt: jest.fn(async () => 50_000),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { isConfigured } from "@/lib/portpos";
import { getPlan05Bool, getRevenueModel, getMaxCommissionDebtBdt } from "@/lib/platformConfig";
import { GET } from "@/app/api/driver/dues+api";
import { POST } from "@/app/api/driver/dues/pay+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function request(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
    headers: { get: () => null },
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** Queue of result-sets, one per db.select() call in route order. */
function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

/**
 * user, driver, [active subscription — GET only], accrued commission,
 * settled total, open bills. POST /dues/pay never reads subscriptions/bills,
 * so it passes includeSubscription: false / includeBills: false.
 * The view (driver_unpaid_obligations) is read via db.execute, mocked below.
 */
function queueDuesBase(
  accrued: number,
  settled: number,
  opts: {
    includeSubscription?: boolean;
    includeBills?: boolean;
    enrollment?: Row | null;
  } = {},
): void {
  // Select order in GET /api/driver/dues: users, drivers, subscriptions,
  // commissionEnrollments, driverBills — then the view via db.execute.
  const queue: Row[][] = [
    [{ id: USER_ID }],
    [{ id: DRIVER_ID, status: "active" }],
    [], // subscriptions (none usable in these tests)
    opts.enrollment ? [opts.enrollment] : [], // commissionEnrollments
    [], // driverBills (none open)
  ];
  mockSelectQueue(queue);
  // View read (db.execute): total_unpaid_paisa = accrued - settled floored at 0;
  // no self-bill in these tests, so lockout_exposure == total.
  const net = Math.max(0, accrued - settled);
  (db.execute as jest.Mock).mockResolvedValue([{
    driver_id: DRIVER_ID,
    total_unpaid_paisa: String(net),
    net_commission_paisa: String(net),
    unpaid_subscription_paisa: "0",
    active_self_bill_paisa: "0",
    lockout_exposure_paisa: String(net),
  }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (isConfigured as jest.Mock).mockReturnValue(true);
  (getPlan05Bool as jest.Mock).mockResolvedValue(true);
  (getRevenueModel as jest.Mock).mockResolvedValue("hybrid");
  (getMaxCommissionDebtBdt as jest.Mock).mockResolvedValue(50_000);
  (initiatePortposPayment as jest.Mock).mockResolvedValue({
    payment_url: "https://portpos/checkout",
    payment_event_id: "pe-dues",
  });
});

describe("GET /api/driver/dues — net commission dues", () => {
  test("due = accrued − settled, returned in integer paisa", async () => {
    queueDuesBase(20_000, 5_000);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);

    // Stage 1: the view exposes the NET only — accrued and settled mirror it.
    expect(body.commission_accrued_bdt).toBe(15_000);
    expect(body.commission_settled_bdt).toBe(15_000);
    expect(body.commission_due_bdt).toBe(15_000);
    expect(body.total_outstanding_bdt).toBe(15_000);
    expect(body.max_debt_limit_bdt).toBe(50_000);
    expect(body.is_dispatch_locked).toBe(false);
  });

  test("settlements exceeding accrual floor the due at zero (never negative)", async () => {
    queueDuesBase(10_000, 25_000);

    const body = await getJson(await GET(request()));

    expect(body.commission_accrued_bdt).toBe(0);
    expect(body.commission_settled_bdt).toBe(0);
    expect(body.commission_due_bdt).toBe(0);
    expect(body.total_outstanding_bdt).toBe(0);
    expect(body.is_dispatch_locked).toBe(false);
  });

  test("hybrid locks at the configured ceiling (>=, integer paisa)", async () => {
    queueDuesBase(55_000, 5_000); // due 50,000 == ceiling

    const body = await getJson(await GET(request()));

    expect(body.commission_accrued_bdt).toBe(50_000);
    expect(body.commission_settled_bdt).toBe(50_000);
    expect(body.commission_due_bdt).toBe(50_000);
    expect(body.is_dispatch_locked).toBe(true);
  });

  test("subscription_only never locks on commission debt (legacy gate is the package)", async () => {
    (getRevenueModel as jest.Mock).mockResolvedValue("subscription_only");
    queueDuesBase(80_000, 0);

    const body = await getJson(await GET(request()));

    expect(body.commission_accrued_bdt).toBe(80_000);
    expect(body.commission_settled_bdt).toBe(80_000);
    expect(body.commission_due_bdt).toBe(80_000);
    expect(body.is_dispatch_locked).toBe(false);
  });

  // ── D3-B-r2 audit closure: enrollment expiry in the state machine ────────

  test("D3-B-r2: expired enrollment (expires_at <= now) reports LAPSED", async () => {
    queueDuesBase(0, 0, {
      enrollment: { id: "enr-1", expires_at: new Date(Date.now() - 3_600_000).toISOString() },
    });

    const body = await getJson(await GET(request()));

    expect(body.monetization_state).toBe("LAPSED");
    // Zero dues → debt-based lockout unchanged (state only).
    expect(body.is_dispatch_locked).toBe(false);
  });

  test("D3-B-r2: usable (non-expiring) enrollment keeps the driver out of LAPSED", async () => {
    queueDuesBase(0, 0, {
      enrollment: { id: "enr-1", expires_at: null },
    });

    const body = await getJson(await GET(request()));

    expect(body.monetization_state).toBe("ACTIVE");
    expect(body.is_dispatch_locked).toBe(false);
  });
});

describe("POST /api/driver/dues/pay — PortPos settlement initiation", () => {
  test("initiates the full outstanding balance with purpose commission_settlement", async () => {
    queueDuesBase(20_000, 5_000, { includeSubscription: false });

    const res = await POST(request({}));
    expect(res.status).toBe(200);
    const body = await getJson(res);

    expect(body).toMatchObject({
      payment_url: "https://portpos/checkout",
      payment_event_id: "pe-dues",
      amount_bdt: 15_000,
    });
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_id: DRIVER_ID,
        amount_bdt: 15_000,
        purpose: "commission_settlement",
      }),
    );
  });

  test("accepts an explicit partial amount within the outstanding balance", async () => {
    queueDuesBase(20_000, 5_000, { includeSubscription: false });

    const res = await POST(request({ amount_bdt: 2_500 }));
    expect(res.status).toBe(200);
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount_bdt: 2_500 }),
    );
  });

  test("400 no_dues_outstanding when nothing is owed", async () => {
    queueDuesBase(5_000, 5_000, { includeSubscription: false });

    const res = await POST(request({}));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("no_dues_outstanding");
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("400 amount_exceeds_dues — the client can never overpay the ledger", async () => {
    queueDuesBase(20_000, 5_000, { includeSubscription: false });

    const res = await POST(request({ amount_bdt: 20_000 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("amount_exceeds_dues");
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("400 amount_below_minimum — ৳10 floor (1,000 paisa)", async () => {
    queueDuesBase(500, 0, { includeSubscription: false }); // default amount = 500 paisa

    const res = await POST(request({}));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("amount_below_minimum");
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("409 payments_not_enabled while the money-movement master switch is OFF", async () => {
    (getPlan05Bool as jest.Mock).mockResolvedValue(false);
    queueDuesBase(20_000, 5_000, { includeSubscription: false });

    const res = await POST(request({}));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("payments_not_enabled");
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("403 driver_not_active — suspended drivers cannot settle (and cannot be unlocked)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID, status: "suspended" }]]);

    const res = await POST(request({}));
    expect(res.status).toBe(403);
    expect((await getJson(res)).error).toBe("driver_not_active");
  });
});
