/**
 * P0-10 (gap ledger): driver payout-method routes (R2.2). The masking lib is
 * already unit-tested; these cover the handler branches:
 *  - GET returns ALL active methods with account_number_masked attached
 *  - POST: bKash/Nagad phone-format gate, duplicate-account 409,
 *    first-method-becomes-default, 201 masked response
 *  - PATCH: missing id 400, foreign/inactive method 404, partial update
 *  - DELETE: soft-delete + transactional default promotion to the newest
 *    remaining active method (no promotion when a non-default is removed)
 */
 
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { driverPayoutMethods } from "@/src/db/schema";
import { GET, POST, PATCH, DELETE, maskAccount } from "@/app/api/driver/payout-method+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const METHOD_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

function request(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
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

const inserts: { table: unknown; values: Row }[] = [];
const updates: { table: unknown; set: Row }[] = [];
let updateReturning: Row[] = [];

function resetWriteMocks(): void {
  inserts.length = 0;
  updates.length = 0;
  updateReturning = [];
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: Row) => {
      inserts.push({ table, values: v });
      return {
        returning: jest.fn(async () => updateReturning),
      };
    }),
  }));
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updates.push({ table, set: setObj });
      return {
        where: jest.fn(() => ({
          returning: jest.fn(async () => updateReturning),
          then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve([]).then(res, rej),
        })),
        returning: jest.fn(async () => updateReturning),
      };
    }),
  }));
}

function mockTransaction(txSelectRows: Row[]): { txUpdates: { table: unknown; set: Row }[] } {
  const txUpdates: { table: unknown; set: Row }[] = [];
  const tx = {
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          txUpdates.push({ table, set: setObj });
          return [];
        }),
      })),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn(async () => txSelectRows),
          })),
        })),
      })),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return { txUpdates };
}

const METHOD_ROW: Row = {
  id: METHOD_ID,
  driver_id: DRIVER_ID,
  method_type: "bkash",
  account_number: "01712345678",
  account_name: "Kamal",
  is_active: true,
  is_default: true,
  created_at: new Date("2026-09-01T00:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  resetWriteMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

describe("GET /api/driver/payout-method", () => {
  test("returns active methods with masked account numbers", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [METHOD_ROW]]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const methods = body.payout_methods as Row[];
    expect(methods).toHaveLength(1);
    expect(methods[0].account_number_masked).toBe("*******5678");
  });

  test("404 when the caller has no driver row", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/driver/payout-method", () => {
  const VALID = { method_type: "bkash", account_number: "01712345678" };

  test("400 invalid_account for a non-phone bKash number", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Kamal" }], [{ id: DRIVER_ID }]]);
    const res = await POST(request({ ...VALID, account_number: "12345abc" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_account");
  });

  test("409 duplicate_account for an already-active account", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Kamal" }], [{ id: DRIVER_ID }], [{ id: "existing" }]]);
    const res = await POST(request(VALID));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("duplicate_account");
  });

  test("first method becomes the default; response is masked", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Kamal" }], [{ id: DRIVER_ID }], [] , [{ count: 0 }]]);
    updateReturning = [{ ...METHOD_ROW }];

    const res = await POST(request(VALID));
    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect((body.payout_method as Row).account_number_masked).toBe("*******5678");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(driverPayoutMethods);
    expect(inserts[0].values).toMatchObject({
      driver_id: DRIVER_ID,
      method_type: "bkash",
      account_number: "01712345678",
      account_name: "Kamal", // falls back to the user's name
      is_default: true,
      is_active: true,
    });
  });

  test("subsequent methods are NOT default", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Kamal" }], [{ id: DRIVER_ID }], [], [{ count: 2 }]]);
    updateReturning = [{ ...METHOD_ROW, is_default: false }];

    const res = await POST(request(VALID));
    expect(res.status).toBe(201);
    expect(inserts[0].values.is_default).toBe(false);
  });

  test("bank accounts skip the phone-format gate", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Kamal" }], [{ id: DRIVER_ID }], [], [{ count: 0 }]]);
    updateReturning = [{ ...METHOD_ROW, method_type: "bank", account_number: "1234567890" }];

    const res = await POST(request({ method_type: "bank", account_number: "1234567890", bank_name: "DBBL" }));
    expect(res.status).toBe(201);
    expect(inserts[0].values.bank_name).toBe("DBBL");
  });
});

describe("PATCH /api/driver/payout-method", () => {
  test("400 missing_id when no id query param", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    const res = await PATCH(request({ account_name: "New" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("missing_id");
  });

  test("404 when the method belongs to another driver or is inactive", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], []]);
    const res = await PATCH(request({ account_name: "New" }, `http://localhost/test?id=${METHOD_ID}`));
    expect(res.status).toBe(404);
  });

  test("applies only provided fields and returns the masked row", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [METHOD_ROW]]);
    updateReturning = [{ ...METHOD_ROW, account_name: "Renamed" }];

    const res = await PATCH(request({ account_name: "Renamed" }, `http://localhost/test?id=${METHOD_ID}`));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(driverPayoutMethods);
    expect(updates[0].set).toMatchObject({ account_name: "Renamed" });
    expect((await getJson(res)).payout_method).toMatchObject({ account_name: "Renamed" });
  });
});

describe("DELETE /api/driver/payout-method", () => {
  test("400 missing_id", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    const res = await DELETE(request(undefined, "http://localhost/test"));
    expect(res.status).toBe(400);
  });

  test("404 for an unknown method", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], []]);
    const res = await DELETE(request(undefined, `http://localhost/test?id=${METHOD_ID}`));
    expect(res.status).toBe(404);
  });

  test("soft-deletes and promotes the newest remaining active method when the default is removed", async () => {
    const remaining = { id: "other-method" };
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [METHOD_ROW]]);
    const { txUpdates } = mockTransaction([remaining]);

    const res = await DELETE(request(undefined, `http://localhost/test?id=${METHOD_ID}`));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true });

    // soft-delete inside the tx
    expect(txUpdates).toHaveLength(2);
    expect(txUpdates[0]).toEqual({ table: driverPayoutMethods, set: expect.objectContaining({ is_active: false }) });
    // promotion to the newest remaining active method
    expect(txUpdates[1]).toEqual({ table: driverPayoutMethods, set: expect.objectContaining({ is_default: true }) });
  });

  test("removing a non-default promotes nothing", async () => {
    const nonDefault = { ...METHOD_ROW, is_default: false };
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [nonDefault]]);
    const { txUpdates } = mockTransaction([]);

    const res = await DELETE(request(undefined, `http://localhost/test?id=${METHOD_ID}`));
    expect(res.status).toBe(200);
    expect(txUpdates).toHaveLength(1); // only the soft-delete
  });
});
