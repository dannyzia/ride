/**
 * P0-3 (gap ledger): rider fare-dispute submission — POST/GET branches.
 *
 * Money-path invariants:
 *  - 48h dispute window (422 dispute_window_expired)
 *  - ownership (403) + driver-on-record gate (422 ride_not_disputable)
 *  - M-30 duplicate protection: advisory lock + existing-dispute check inside
 *    the tx → 409 duplicate_dispute (double-refund vector closed)
 *  - dispute insert carries charged_fare_bdt = rider_payable_bdt ??
 *    driver_fare_bdt ?? 0 and passes the tx to autoArbitrateDispute
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
jest.mock("@/lib/fareArbitration", () => ({
  autoArbitrateDispute: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { autoArbitrateDispute } from "@/lib/fareArbitration";
import { POST, GET } from "@/app/api/rider/fare-disputes+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";
const RIDE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";
const DISPUTE_ID = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

const VALID_BODY = {
  ride_id: RIDE_ID,
  claimed_fare_bdt: 9_000,
  dispute_reason: "route_longer",
  rider_note: "route felt long",
};

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function recentRide(): Row {
  // completed 1h ago → inside the 48h window
  return {
    id: RIDE_ID,
    user_id: RIDER_ID,
    driver_id: DRIVER_ID,
    completed_at: new Date(Date.now() - 3_600_000),
    rider_payable_bdt: 10_000,
    driver_fare_bdt: 8_500,
  };
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
          orderBy: jest.fn(async () => rows),
        })),
      })),
    };
  });
}

interface TxRecorder {
  selectRows: Row[];
  insertValues: Row | null;
  executedSql: unknown;
}

function mockTransaction(options: { existing?: Row[]; disputeRows?: Row[] }): TxRecorder {
  const rec: TxRecorder = { selectRows: options.existing ?? [], insertValues: null, executedSql: null };
  const tx = {
    execute: jest.fn(async (sqlObj: unknown) => {
      rec.executedSql = sqlObj;
      return [];
    }),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rec.selectRows),
        })),
      })),
    })),
    insert: jest.fn((_table: unknown) => ({
      values: jest.fn((v: Row) => ({
        returning: jest.fn(async () =>
          options.disputeRows ?? [{ id: DISPUTE_ID, ...v }],
        ),
      })),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    await cb(tx);
    return undefined;
  });
  // capture insert values after the fact via the tx insert mock
  (tx.insert as jest.Mock).mockImplementation((_table: unknown) => ({
    values: jest.fn((v: Row) => {
      rec.insertValues = v;
      return {
        returning: jest.fn(async () =>
          options.disputeRows ?? [{ id: DISPUTE_ID, ...v }],
        ),
      };
    }),
  }));
  return rec;
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (autoArbitrateDispute as jest.Mock).mockResolvedValue({ resolution: "pending", refund_bdt: 0 });
});

describe("POST /api/rider/fare-disputes — branches", () => {
  test("401 unauthorized when token verification fails", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("unauthorized");
  });

  test("404 user_not_found when auth uid maps to no app user", async () => {
    mockSelectQueue([[]]);
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  test("400 validation_error for a negative claimed_fare_bdt", async () => {
    mockSelectQueue([[{ id: RIDER_ID }]]);
    const res = await POST(jsonRequest({ ...VALID_BODY, claimed_fare_bdt: -1 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("404 ride_not_found for an unknown ride", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], []]);
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("ride_not_found");
  });

  test("403 forbidden when the ride belongs to another rider", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), user_id: "other-rider" }]]);
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect((await getJson(res)).error).toBe("forbidden");
  });

  test("422 dispute_window_expired when the ride has no completed_at", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), completed_at: null }]]);
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("dispute_window_expired");
  });

  test("422 dispute_window_expired after 48 hours", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), completed_at: new Date(Date.now() - 49 * 3_600_000) }]]);
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("dispute_window_expired");
  });

  test("422 ride_not_disputable when the completed ride has no driver on record", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), driver_id: null }]]);
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("ride_not_disputable");
  });

  test("409 duplicate_dispute when a dispute already exists for the ride", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [recentRide()]]);
    mockTransaction({ existing: [{ id: DISPUTE_ID }] });

    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("duplicate_dispute");
  });

  test("success: advisory lock taken, dispute inserted with charged fare fallback, arbitration inside the tx", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [recentRide()]]);
    const rec = mockTransaction({});

    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({
      dispute_id: DISPUTE_ID,
      resolution: "pending",
      refund_bdt: 0,
    });

    // M-30: advisory lock runs BEFORE the duplicate check
    expect(rec.executedSql).toBeDefined();
    expect(rec.insertValues).toMatchObject({
      ride_id: RIDE_ID,
      rider_id: RIDER_ID,
      driver_id: DRIVER_ID,
      claimed_fare_bdt: 9_000,
      // rider_payable_bdt (10000) wins the ?? chain
      charged_fare_bdt: 10_000,
      dispute_reason: "route_longer",
      rider_note: "route felt long",
    });
    expect(autoArbitrateDispute).toHaveBeenCalledWith(DISPUTE_ID, expect.anything());
  });

  test("charged_fare_bdt falls back to driver_fare_bdt when rider_payable_bdt is null", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), rider_payable_bdt: null }]]);
    const rec = mockTransaction({});

    await POST(jsonRequest(VALID_BODY));
    expect(rec.insertValues!.charged_fare_bdt).toBe(8_500);
  });
});

describe("GET /api/rider/fare-disputes", () => {
  test("returns the rider's disputes", async () => {
    const rows = [{ id: DISPUTE_ID, rider_id: RIDER_ID }];
    mockSelectQueue([[{ id: RIDER_ID }], rows]);

    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    expect((await getJson(res)).disputes).toEqual(rows);
  });

  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(401);
  });
});
