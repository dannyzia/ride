/**
 * P0-7 (gap ledger): rider wallet balance/transactions GET + topup POST.
 * Handlers were previously untested (lib/paymentEvents beneath them was).
 * Balance is integer paisa via `?? 0` fallback; topup delegates to the
 * payment_events write owner with purpose='wallet_topup'.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    // idempotency claim/outcome writes (lib/idempotency.ts) — fire-and-forget
    insert: jest.fn(() => ({ values: jest.fn(async () => undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/portpos", () => ({
  isConfigured: jest.fn(),
}));
jest.mock("@/lib/paymentEvents", () => ({
  initiatePortposPayment: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { isConfigured } from "@/lib/portpos";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { GET } from "@/app/api/rider/wallet+api";
import { POST } from "@/app/api/rider/wallet/topup+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";

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

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (isConfigured as jest.Mock).mockReturnValue(true);
  (initiatePortposPayment as jest.Mock).mockResolvedValue({
    payment_url: "https://portpos/checkout",
    payment_event_id: "pe-1",
  });
});

describe("GET /api/rider/wallet", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  test("returns integer-paisa balance and ISO-serialized recent transactions", async () => {
    const txRow = {
      id: "tx-1",
      transaction_type: "topup",
      amount_bdt: 50_000,
      balance_after: 150_000,
      created_at: new Date("2026-09-01T10:00:00Z"),
    };
    mockSelectQueue([[{ id: RIDER_ID, rider_wallet_balance_bdt: 150_000 }], [txRow]]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.balance_bdt).toBe(150_000);
    expect(body.recent_transactions).toEqual([
      {
        id: "tx-1",
        transaction_type: "topup",
        amount_bdt: 50_000,
        balance_after: 150_000,
        created_at: "2026-09-01T10:00:00.000Z",
      },
    ]);
  });

  test("null balance serializes as 0", async () => {
    mockSelectQueue([[{ id: RIDER_ID, rider_wallet_balance_bdt: null }], []]);
    const res = await GET(request());
    expect((await getJson(res)).balance_bdt).toBe(0);
  });
});

describe("POST /api/rider/wallet/topup", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(request({ amount_bdt: 50_000 }));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(request({ amount_bdt: 50_000 }));
    expect(res.status).toBe(404);
  });

  test("400 validation_error below the ৳100 floor (10000 paisa)", async () => {
    mockSelectQueue([[{ id: RIDER_ID }]]);
    const res = await POST(request({ amount_bdt: 9_999 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("503 payment_not_configured when PortPos env is missing", async () => {
    mockSelectQueue([[{ id: RIDER_ID }]]);
    (isConfigured as jest.Mock).mockReturnValue(false);
    const res = await POST(request({ amount_bdt: 50_000 }));
    expect(res.status).toBe(503);
    expect((await getJson(res)).error).toBe("payment_not_configured");
  });

  test("success: payment_events owner called with purpose wallet_topup and the user's identity", async () => {
    mockSelectQueue([
      [{ id: RIDER_ID, name: "Zia", email: null, phone: "+8801700000000" }],
    ]);

    const res = await POST(request({ amount_bdt: 50_000 }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ payment_url: "https://portpos/checkout", payment_event_id: "pe-1" });
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: RIDER_ID,
        amount_bdt: 50_000,
        purpose: "wallet_topup",
        customer_name: "Zia",
        customer_email: "",
        customer_phone: "+8801700000000",
      }),
    );
  });

  test("500 when the payment initiation returns null", async () => {
    mockSelectQueue([[{ id: RIDER_ID, name: "Zia", email: null, phone: "+880" }]]);
    (initiatePortposPayment as jest.Mock).mockResolvedValue(null);
    const res = await POST(request({ amount_bdt: 50_000 }));
    expect(res.status).toBe(500);
    expect((await getJson(res)).error).toBe("internal_error");
  });
});
