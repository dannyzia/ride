/**
 * P0-7 (gap ledger): driver wallet balance/transactions GET + topup POST.
 * Driver topup has no isConfigured gate (unlike the rider route) but scopes
 * the payment event to the driver via driver_id.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/paymentEvents", () => ({
  initiatePortposPayment: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { GET } from "@/app/api/driver/wallet+api";
import { POST } from "@/app/api/driver/wallet/topup+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

function request(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
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
  (initiatePortposPayment as jest.Mock).mockResolvedValue({
    payment_url: "https://portpos/checkout",
    payment_event_id: "pe-1",
  });
});

describe("GET /api/driver/wallet", () => {
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

  test("404 driver_not_found when the user has no driver row", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await GET(request());
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("driver_not_found");
  });

  test("returns integer-paisa balance and ISO-serialized transactions", async () => {
    const txRow = {
      id: "dtx-1",
      transaction_type: "adjustment",
      amount_bdt: 30_000,
      balance_after: 45_000,
      created_at: new Date("2026-09-02T12:00:00Z"),
    };
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID, driver_wallet_balance_bdt: 45_000 }], [txRow]]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.balance_bdt).toBe(45_000);
    expect(body.recent_transactions).toEqual([
      {
        id: "dtx-1",
        transaction_type: "adjustment",
        amount_bdt: 30_000,
        balance_after: 45_000,
        created_at: "2026-09-02T12:00:00.000Z",
      },
    ]);
  });
});

describe("POST /api/driver/wallet/topup", () => {
  const VALID = { amount_bdt: 50_000 };

  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(request(VALID));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(request(VALID));
    expect(res.status).toBe(404);
  });

  test("404 driver_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await POST(request(VALID));
    expect(res.status).toBe(404);
  });

  test("400 validation_error below the 10000-paisa floor", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    const res = await POST(request({ amount_bdt: 9_999 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("success: payment_events owner called with user_id + driver_id + purpose wallet_topup", async () => {
    mockSelectQueue([
      [{ id: USER_ID, name: "Kamal", email: "k@x.bd", phone: "+8801700000001" }],
      [{ id: DRIVER_ID }],
    ]);

    const res = await POST(request(VALID));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ payment_url: "https://portpos/checkout", payment_event_id: "pe-1" });
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        driver_id: DRIVER_ID,
        amount_bdt: 50_000,
        purpose: "wallet_topup",
      }),
    );
  });

  test("500 when initiation returns null", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Kamal", email: null, phone: "+880" }], [{ id: DRIVER_ID }]]);
    (initiatePortposPayment as jest.Mock).mockResolvedValue(null);
    const res = await POST(request(VALID));
    expect(res.status).toBe(500);
  });
});
