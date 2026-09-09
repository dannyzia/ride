/**
 * P1-18 (gap ledger): rider passes — browse (GET) + purchase initiation (POST,
 * W-2 no-stacking rule). The activation/repair path is already tested
 * (lib/activateSubscription, lib/paymentRepair); this covers the handler:
 *  - GET returns active passes + the rider's live subscription
 *  - POST blocks a second purchase while a pass is active (409) BEFORE the
 *    gateway configuration gate, then delegates to the payment_events owner
 *    with purpose='rider_pass'
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
import { GET, POST } from "@/app/api/rider/passes+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PASS_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const PASS: Row = {
  id: PASS_ID,
  name: "Monthly 50",
  price_bdt: 99_000,
  is_active: true,
};

function jsonRequest(body?: unknown): Request {
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
      where: () => chain,
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
    payment_event_id: "pe-pass",
  });
});

describe("GET /api/rider/passes", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await GET(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await GET(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("returns active passes and the live subscription (or null)", async () => {
    const passes = [PASS];
    const activeSub = { id: "sub-1", status: "active" };
    mockSelectQueue([[{ id: USER_ID }], passes, [activeSub]]);

    const res = await GET(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.passes).toEqual(passes);
    expect(body.active_subscription).toEqual(activeSub);
  });

  test("no active subscription → active_subscription null", async () => {
    mockSelectQueue([[{ id: USER_ID }], [PASS], []]);
    const res = await GET(jsonRequest());
    expect((await getJson(res)).active_subscription).toBeNull();
  });
});

describe("POST /api/rider/passes", () => {
  const BODY = { pass_id: PASS_ID };

  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(404);
  });

  test("400 validation_error for a non-uuid pass_id", async () => {
    mockSelectQueue([[{ id: USER_ID }]]);
    const res = await POST(jsonRequest({ pass_id: "abc" }));
    expect(res.status).toBe(400);
  });

  test("404 pass_not_found for unknown or inactive pass", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("pass_not_found");
  });

  test("409 active_subscription_exists — W-2 no-stacking, before the gateway gate", async () => {
    mockSelectQueue([[{ id: USER_ID }], [PASS], [{ id: "sub-live" }]]);
    (isConfigured as jest.Mock).mockReturnValue(false); // must never be reached

    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("active_subscription_exists");
  });

  test("503 payment_not_configured when PortPos env is missing", async () => {
    mockSelectQueue([[{ id: USER_ID }], [PASS], []]);
    (isConfigured as jest.Mock).mockReturnValue(false);
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(503);
  });

  test("success: payment_events owner called with purpose rider_pass and the pass price", async () => {
    mockSelectQueue([
      [{ id: USER_ID, name: "Zia", email: null, phone: "+8801700000000" }],
      [PASS],
      [],
    ]);

    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ payment_url: "https://portpos/checkout", payment_event_id: "pe-pass" });
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        pass_id: PASS_ID,
        amount_bdt: 99_000,
        purpose: "rider_pass",
      }),
    );
  });

  test("500 when initiation returns null", async () => {
    mockSelectQueue([
      [{ id: USER_ID, name: "Zia", email: null, phone: "+880" }],
      [PASS],
      [],
    ]);
    (initiatePortposPayment as jest.Mock).mockResolvedValue(null);
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(500);
  });
});
