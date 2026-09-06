/**
 * P1-13 (gap ledger): rider loyalty points — GET balance/history/offers +
 * POST redeem (points → wallet credit). Money-path invariants:
 *  - redeem is a FOR UPDATE transactional claim: insufficient balance → 422
 *    with NO ledger row and NO wallet movement
 *  - wallet_credit rewards credit the rider wallet inside the same tx
 *  - non-wallet rewards book the point debit but never touch the wallet
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

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { points, pointTransactions, users } from "@/src/db/schema";
import { GET, POST } from "@/app/api/rider/points+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const WALLET_OFFER: Row = {
  id: OFFER_ID,
  is_active: true,
  points_required: 500,
  reward_type: "wallet_credit",
  reward_value_bdt: 10_000,
};

function jsonRequest(body?: unknown): Request {
  return { json: body === undefined ? undefined : async () => body } as unknown as Request;
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
      orderBy: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

interface TxRecorder {
  balanceRow: Row | null;
  pointUpdateSet: Row | null;
  txInsertValues: Row | null;
  walletCreditSet: Row | null;
}

function mockTransaction(pointBalanceRow: Row | null): TxRecorder {
  const rec: TxRecorder = { balanceRow: pointBalanceRow, pointUpdateSet: null, txInsertValues: null, walletCreditSet: null };
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            for: jest.fn(async () => (pointBalanceRow ? [pointBalanceRow] : [])),
          })),
        })),
      })),
    })),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        if (table === points) rec.pointUpdateSet = setObj;
        if (table === users) rec.walletCreditSet = setObj;
        return { where: jest.fn(async () => []) };
      }),
    })),
    insert: jest.fn((_table: unknown) => ({
      values: jest.fn((v: Row) => {
        rec.txInsertValues = v;
        return Promise.resolve([]);
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return rec;
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

describe("GET /api/rider/points", () => {
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

  test("returns balance (0 fallback), history, and active offers", async () => {
    const history = [{ id: "pt-1", amount: 100 }];
    const offers = [{ id: OFFER_ID, is_active: true }];
    mockSelectQueue([[{ id: USER_ID }], [{ balance: 1_250 }], history, offers]);

    const res = await GET(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.balance).toBe(1_250);
    expect(body.history).toEqual(history);
    expect(body.offers).toEqual(offers);
  });

  test("no points row → balance 0", async () => {
    mockSelectQueue([[{ id: USER_ID }], [], [], []]);
    const res = await GET(jsonRequest());
    expect((await getJson(res)).balance).toBe(0);
  });
});

describe("POST /api/rider/points (redeem)", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(404);
  });

  test("400 validation_error for a non-uuid offer_id", async () => {
    mockSelectQueue([[{ id: USER_ID }]]);
    const res = await POST(jsonRequest({ offer_id: "abc" }));
    expect(res.status).toBe(400);
  });

  test("404 offer_not_found for an unknown OR inactive offer", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("offer_not_found");
  });

  test("422 insufficient_points with NO ledger row and NO wallet movement", async () => {
    mockSelectQueue([[{ id: USER_ID }], [WALLET_OFFER]]);
    const rec = mockTransaction({ balance: 100 }); // 100 < 500 required

    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("insufficient_points");
    expect(rec.pointUpdateSet).toBeNull();
    expect(rec.txInsertValues).toBeNull();
    expect(rec.walletCreditSet).toBeNull();
  });

  test("no points row at all → 422 (treated as zero balance)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [WALLET_OFFER]]);
    mockTransaction(null);

    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(422);
  });

  test("wallet_credit reward: points debited, ledger row booked, wallet credited in one tx", async () => {
    mockSelectQueue([[{ id: USER_ID }], [WALLET_OFFER]]);
    const rec = mockTransaction({ balance: 2_000 });

    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, reward_bdt: 10_000 });

    expect(rec.pointUpdateSet).toBeDefined();
    expect(rec.txInsertValues).toMatchObject({
      user_id: USER_ID,
      transaction_type: "redeemed",
      amount: -500,
      balance_after: 1_500,
    });
    expect(rec.walletCreditSet).toBeDefined();
  });

  test("non-wallet reward: points debited but wallet never touched, reward_bdt 0", async () => {
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ ...WALLET_OFFER, reward_type: "discount_voucher", reward_value_bdt: null }],
    ]);
    const rec = mockTransaction({ balance: 2_000 });

    const res = await POST(jsonRequest({ offer_id: OFFER_ID }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, reward_bdt: 0 });
    expect(rec.pointUpdateSet).toBeDefined();
    expect(rec.walletCreditSet).toBeNull();
  });
});
