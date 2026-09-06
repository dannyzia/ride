/**
 * P1-11 (gap ledger): POST /api/ride/[id]/rate — both rating directions.
 * Money/trust invariants:
 *  - only participants of a COMPLETED ride can rate (422/403 gates)
 *  - M-4 atomic claim: concurrent double-rates both pass the JS null-check;
 *    only one wins the rider_rating/driver_rating IS NULL claim — the loser
 *    rolls back to 409 and the rating_sum/rating_count can never double-count
 *  - rider rating increments the DRIVER's rating aggregate; driver rating
 *    increments the RIDER USER's aggregate (sql`rating_sum + r` shape)
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
import { rides } from "@/src/db/schema";
import { POST } from "@/app/api/ride/[id]/rate+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";
const RIDE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

const COMPLETED_RIDE: Row = {
  id: RIDE_ID,
  user_id: RIDER_ID,
  driver_id: DRIVER_ID,
  status: "completed",
  rider_rating: null,
  driver_rating: null,
};

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
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

interface TxRecorder {
  claimSet: Row | null;
  aggregateTable: unknown | null;
  aggregateSet: Row | null;
}

function mockTransaction(claimedRows: Row[]): TxRecorder {
  const rec: TxRecorder = { claimSet: null, aggregateTable: null, aggregateSet: null };
  const tx = {
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => (table === rides ? claimedRows : [])),
        })),
      })),
    })),
  };
  (tx.update as jest.Mock).mockImplementation((table: unknown) => {
    return {
      set: jest.fn((setObj: Row) => {
        if (table === rides) rec.claimSet = setObj;
        else {
          rec.aggregateTable = table;
          rec.aggregateSet = setObj;
        }
        return {
          where: jest.fn(() => ({
            returning: jest.fn(async () => (table === rides ? claimedRows : [])),
          })),
        };
      }),
    };
  });
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return rec;
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

describe("POST /api/ride/[id]/rate — branches", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(401);
  });

  test("400 invalid_uuid", async () => {
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: "nope" });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
  });

  test("400 validation_error for rating 0 and rating 6", async () => {
    mockSelectQueue([[{ id: RIDER_ID }]]);
    const zero = await POST(jsonRequest({ rating: 0, role: "rider" }), { id: RIDE_ID });
    expect(zero.status).toBe(400);
    expect((await getJson(zero)).error).toBe("validation_error");

    mockSelectQueue([[{ id: RIDER_ID }]]);
    const six = await POST(jsonRequest({ rating: 6, role: "rider" }), { id: RIDE_ID });
    expect(six.status).toBe(400);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(404);
  });

  test("404 ride_not_found", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], []]);
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(404);
  });

  test("422 ride_not_completed", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, status: "in_progress" }]]);
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("ride_not_completed");
  });
});

describe("POST /api/ride/[id]/rate — rider rates driver", () => {
  test("403 not_participant when caller is not the ride's rider", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, user_id: "someone-else" }]]);
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect((await getJson(res)).error).toBe("not_participant");
  });

  test("409 already_rated when rider_rating is set", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, rider_rating: 4 }]]);
    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(409);
  });

  test("success: IS NULL claim wins, driver rating aggregate incremented", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE]]);
    const rec = mockTransaction([{ id: RIDE_ID }]);

    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });

    expect(rec.claimSet).toEqual({ rider_rating: 5 });
    expect(rec.aggregateTable).toBeDefined();
    expect(rec.aggregateTable).not.toBe(rides);
    expect(rec.aggregateSet).toBeDefined();
  });

  test("concurrent double-rate loses the IS NULL claim → 409, no aggregate write", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE]]);
    const rec = mockTransaction([]);

    const res = await POST(jsonRequest({ rating: 5, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("already_rated");
    expect(rec.aggregateTable).toBeNull();
  });

  test("ride without a driver: claim succeeds, no aggregate write", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, driver_id: null }]]);
    const rec = mockTransaction([{ id: RIDE_ID }]);

    const res = await POST(jsonRequest({ rating: 3, role: "rider" }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(rec.claimSet).toEqual({ rider_rating: 3 });
    expect(rec.aggregateTable).toBeNull();
  });
});

describe("POST /api/ride/[id]/rate — driver rates rider", () => {
  test("404 driver_not_found when the caller has no driver row", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], []]);
    const res = await POST(jsonRequest({ rating: 5, role: "driver" }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("driver_not_found");
  });

  test("403 not_participant when the ride belongs to another driver", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], [{ id: "other-driver" }]]);
    const res = await POST(jsonRequest({ rating: 5, role: "driver" }), { id: RIDE_ID });
    expect(res.status).toBe(403);
  });

  test("409 already_rated when driver_rating is set", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, driver_rating: 2 }], [{ id: DRIVER_ID }]]);
    const res = await POST(jsonRequest({ rating: 5, role: "driver" }), { id: RIDE_ID });
    expect(res.status).toBe(409);
  });

  test("success: driver_rating claim + rider user aggregate incremented", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], [{ id: DRIVER_ID }]]);
    const rec = mockTransaction([{ id: RIDE_ID }]);

    const res = await POST(jsonRequest({ rating: 4, role: "driver" }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(rec.claimSet).toEqual({ driver_rating: 4 });
    expect(rec.aggregateTable).not.toBeNull();
    expect(rec.aggregateTable).not.toBe(rides);
  });
});
