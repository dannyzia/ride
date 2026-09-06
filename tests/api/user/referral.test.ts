/**
 * P1-13 (gap ledger): user referral dashboard (GET). Asserts:
 *  - no referral code yet → zeroed payload (code/campaign null, stats 0)
 *  - code present → stats computed from referral rows (total vs status
 *    'rewarded'), referee phones masked to what the join returns
 *  - reward total is aggregated from the role-correct wallet ledger:
 *    drivers via driver_wallet_transactions 'referral_receivable',
 *    riders via rider_wallet_transactions 'referral_reward'
 *  - dates serialize as ISO strings
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

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { GET } from "@/app/api/user/referral+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function request(): Request {
  return { json: undefined } as unknown as Request;
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

const REFERRAL_ROWS: Row[] = [
  {
    id: "ref-1",
    status: "rewarded",
    created_at: new Date("2026-09-01T10:00:00Z"),
    rewarded_at: new Date("2026-09-02T10:00:00Z"),
    referee_id: "44444444-4444-4444-8444-444444444444",
    campaign_id: "camp-1",
  },
  {
    id: "ref-2",
    status: "pending",
    created_at: new Date("2026-09-03T10:00:00Z"),
    rewarded_at: null,
    referee_id: "45454545-4545-4545-8545-454545454545",
    campaign_id: "camp-1",
  },
];

const CAMPAIGN: Row = {
  name: "Launch campaign",
  referrer_reward_percent: 10,
  referee_reward_percent: 5,
  is_active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

describe("GET /api/user/referral", () => {
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

  test("no referral code → zeroed payload", async () => {
    mockSelectQueue([[{ id: USER_ID, role: "rider" }], []]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({
      code: null,
      campaign: null,
      stats: { total_referrals: 0, successful: 0, total_reward_bdt: 0 },
      recent: [],
    });
  });

  test("rider with referrals: stats counted, referee phones attached, rider wallet ledger aggregated", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{ user_id: USER_ID, code: "RIDE-ABCD" }],
      REFERRAL_ROWS,
      [{ id: "44444444-4444-4444-8444-444444444444", phone: "+8801711111111" }], // referee map (only ids present in rows)
      [CAMPAIGN],
      [{ total: 25_000 }], // riderWalletTransactions SUM
    ]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.code).toBe("RIDE-ABCD");
    expect(body.stats).toEqual({ total_referrals: 2, successful: 1, total_reward_bdt: 25_000 });
    expect(body.campaign).toEqual({
      name: "Launch campaign",
      referrer_reward_percent: 10,
      referee_reward_percent: 5,
      referrer_reward_bdt: 0,
      referee_reward_bdt: 5000,
    });
    const recent = body.recent as Record<string, unknown>[];
    expect(recent).toHaveLength(2);
    expect(recent[0]).toEqual({
      referee_phone: "+8801711111111",
      status: "rewarded",
      created_at: "2026-09-01T10:00:00.000Z",
      rewarded_at: "2026-09-02T10:00:00.000Z",
    });
    expect(recent[1].rewarded_at).toBeNull();
  });

  test("driver aggregates rewards from the DRIVER wallet ledger instead", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "driver" }],
      [{ user_id: USER_ID, code: "RIDE-DRV" }],
      REFERRAL_ROWS,
      [],
      [CAMPAIGN],
      [{ id: DRIVER_ID }], // drivers lookup
      [{ total: 60_000 }], // driverWalletTransactions SUM
    ]);

    const res = await GET(request());
    const body = await getJson(res);
    expect(body.stats).toMatchObject({ total_reward_bdt: 60_000 });
  });

  test("500 on unexpected db failure", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
