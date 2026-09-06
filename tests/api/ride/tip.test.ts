/**
 * P0-2 (gap ledger): POST /api/ride/[id]/tip — full branch matrix.
 *
 * Money-path invariants asserted here:
 *  - only the rider of a COMPLETED ride can tip (422/403 gates)
 *  - double-tip: JS pre-check (tip_bdt > 0 → 409) AND the M-3 atomic claim
 *    (UPDATE … WHERE tip_bdt IS NULL) — losing the claim rolls back to 409
 *    with no wallet movement and no accounting entry
 *  - insufficient rider wallet → 422 before any ledger write
 *  - success path: rider debit + driver credit + both wallet transaction
 *    rows + non-blocking recordTip accounting call
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
jest.mock("@/lib/accounting", () => ({
  recordTip: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { recordTip } from "@/lib/accounting";
import { rides } from "@/src/db/schema";
import { POST } from "@/app/api/ride/[id]/tip+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";
const RIDE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** Queue-based mock for the 3 pre-transaction selects (users, rides, drivers). */
function mockSelectQueue(queue: Row[][], throwError = false): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    if (throwError) throw new Error("db connection lost");
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
        })),
      })),
    };
  });
}

interface TxRecorder {
  updateSets: { table: unknown; set: Row; where: unknown }[];
  insertValues: { table: unknown; values: Row }[];
  walletSelectCalled: boolean;
}

function mockTransaction(options: { claimedRows: Row[]; walletRows: Row[] }): TxRecorder {
  const rec: TxRecorder = { updateSets: [], insertValues: [], walletSelectCalled: false };
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            for: jest.fn(async () => {
              rec.walletSelectCalled = true;
              return options.walletRows;
            }),
          })),
        })),
      })),
    })),
  };
  (tx as any).update = jest.fn((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      return {
        where: jest.fn((whereObj: unknown) => {
          rec.updateSets.push({ table, set: setObj, where: whereObj });
          return {
            returning: jest.fn(async () =>
              table === rides ? options.claimedRows : [],
            ),
          };
        }),
      };
    }),
  }));
  (tx as any).insert = jest.fn((table: unknown) => ({
    values: jest.fn((valuesObj: Row) => {
      rec.insertValues.push({ table, values: valuesObj });
      return Promise.resolve([]);
    }),
  }));
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return rec;
}

const COMPLETED_RIDE: Row = {
  id: RIDE_ID,
  user_id: RIDER_ID,
  driver_id: DRIVER_ID,
  status: "completed",
  tip_bdt: null,
  zone_id: "zone-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

describe("POST /api/ride/[id]/tip — auth & validation branches", () => {
  test("401 unauthorized when token verification fails", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("unauthorized");
  });

  test("400 invalid_uuid for a malformed ride id", async () => {
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
  });

  test("400 validation_error when amount_bdt is not a positive integer", async () => {
    mockSelectQueue([[{ id: RIDER_ID }]]);
    const res = await POST(jsonRequest({ amount_bdt: 0 }), { id: RIDE_ID });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });
});

describe("POST /api/ride/[id]/tip — lookup branches", () => {
  test("404 user_not_found when the auth uid maps to no app user", async () => {
    mockSelectQueue([[]]);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("user_not_found");
  });

  test("404 ride_not_found for an unknown ride", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], []]);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("ride_not_found");
  });

  test("422 ride_not_completed when the ride is not completed", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, status: "matched" }]]);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("ride_not_completed");
  });

  test("403 not_rider when the caller is not the ride's rider", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, user_id: "someone-else" }]]);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect((await getJson(res)).error).toBe("not_rider");
  });

  test("409 already_tipped when the ride already carries a positive tip", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...COMPLETED_RIDE, tip_bdt: 500 }]]);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("already_tipped");
  });

  test("404 driver_not_found when the ride's driver row is missing", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], []]);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("driver_not_found");
  });
});

describe("POST /api/ride/[id]/tip — money movement", () => {
  test("success: atomic claim, rider debit, driver credit, ledger rows, accounting entry", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], [{ id: DRIVER_ID }]]);
    const rec = mockTransaction({ claimedRows: [{ id: RIDE_ID }], walletRows: [{ wallet: 5_000 }] });

    const res = await POST(jsonRequest({ amount_bdt: 300 }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, tip_bdt: 300 });

    // M-3 atomic claim: UPDATE rides SET tip_bdt WHERE id AND tip_bdt IS NULL
    const claim = rec.updateSets.find((u) => u.table === rides);
    expect(claim).toBeDefined();
    expect(claim!.set).toEqual({ tip_bdt: 300 });

    // rider wallet debit tx row + driver wallet credit tx row were booked
    const txTables = rec.insertValues.map((i) => i.table);
    expect(txTables).toHaveLength(2);
    expect(rec.insertValues[0].values.amount_bdt).toBe(-300);
    expect(rec.insertValues[1].values.amount_bdt).toBe(300);
    expect(rec.walletSelectCalled).toBe(true);

    // accounting entry (non-blocking) with the exact tip journal params
    expect(recordTip).toHaveBeenCalledWith({
      id: RIDE_ID,
      tipPaisa: 300,
      driverId: DRIVER_ID,
      zoneId: "zone-1",
    });
  });

  test("concurrent double-tip loses the IS NULL claim → 409, zero wallet movement", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], [{ id: DRIVER_ID }]]);
    const rec = mockTransaction({ claimedRows: [], walletRows: [] });

    const res = await POST(jsonRequest({ amount_bdt: 300 }), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("already_tipped");
    // rollback happened before any wallet movement or accounting
    expect(rec.insertValues).toHaveLength(0);
    expect(recordTip).not.toHaveBeenCalled();
  });

  test("insufficient rider wallet → 422, no ledger writes", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], [{ id: DRIVER_ID }]]);
    const rec = mockTransaction({ claimedRows: [{ id: RIDE_ID }], walletRows: [{ wallet: 100 }] });

    const res = await POST(jsonRequest({ amount_bdt: 300 }), { id: RIDE_ID });
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("insufficient_balance");
    expect(rec.insertValues).toHaveLength(0);
    expect(recordTip).not.toHaveBeenCalled();
  });

  test("recordTip failure never fails the tip (non-blocking accounting)", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [COMPLETED_RIDE], [{ id: DRIVER_ID }]]);
    mockTransaction({ claimedRows: [{ id: RIDE_ID }], walletRows: [{ wallet: 5_000 }] });
    (recordTip as jest.Mock).mockRejectedValue(new Error("accounts missing"));

    const res = await POST(jsonRequest({ amount_bdt: 300 }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, tip_bdt: 300 });
  });

  test("500 internal_error on unexpected db failure", async () => {
    mockSelectQueue([], true);
    const res = await POST(jsonRequest({ amount_bdt: 100 }), { id: RIDE_ID });
    expect(res.status).toBe(500);
    expect((await getJson(res)).error).toBe("internal_error");
  });
});
