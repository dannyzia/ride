/**
 * P1-20 (gap ledger): driver document submission — GET + POST branches.
 * Security/integrity invariants:
 *  - M-1: a client-supplied vehicle_id must belong to THIS driver
 *  - doc_type keys must be real enum values (no aliasing)
 *  - C3a: storage URLs must be Ride-owned storage (admin trusts them as
 *    verification evidence — arbitrary hosts rejected)
 *  - M-2: empty submission rejected UNLESS consent-only (M-9 re-submit path)
 *  - N6: per-driver advisory lock serializes concurrent submissions; old live
 *    rows of submitted types are soft-deleted before the new pending insert
 *  - legacy platform screenshots flag is_legacy_operator; temporary drivers
 *    drop to pending; consent persisted with version + timestamp
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/storageUrl", () => ({
  isAllowedStorageUrl: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { isAllowedStorageUrl } from "@/lib/storageUrl";
import { documents, drivers } from "@/src/db/schema";
import { GET, POST } from "@/app/api/driver/documents+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const VEHICLE_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

const URL_OK = "https://storage.supabase.co/driver-documents/lic.jpg";

function jsonRequest(body?: unknown): Request {
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
      where: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

const txUpdates: { table: unknown; set: Row }[] = [];
const txInserts: { table: unknown; values: unknown }[] = [];
const driverUpdates: { set: Row }[] = [];
let advisoryLockRan = false;

function resetWriteMocks(): void {
  txUpdates.length = 0;
  txInserts.length = 0;
  driverUpdates.length = 0;
  advisoryLockRan = false;
  (db.update as jest.Mock).mockImplementation((table: unknown) => {
    if (table === drivers) {
      return {
        set: jest.fn((setObj: Row) => ({
          where: jest.fn(async () => {
            driverUpdates.push({ set: setObj });
            return [];
          }),
        })),
      };
    }
    return {
      set: jest.fn(() => ({ where: jest.fn(async () => []) })),
    };
  });
  const tx = {
    execute: jest.fn(async () => {
      advisoryLockRan = true;
      return [];
    }),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          txUpdates.push({ table, set: setObj });
          return [];
        }),
      })),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((v: unknown) => {
        txInserts.push({ table, values: v });
        return Promise.resolve([]);
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWriteMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (isAllowedStorageUrl as jest.Mock).mockReturnValue(true);
});

const DRIVER_TEMP: Row = { id: DRIVER_ID, status: "temporary" };

describe("GET /api/driver/documents", () => {
  test("404 driver_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await GET(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("returns live documents", async () => {
    const rows = [{ id: "doc-1", doc_type: "license_front", status: "pending" }];
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], rows]);

    const res = await GET(jsonRequest());
    expect(res.status).toBe(200);
    expect((await getJson(res)).documents).toEqual(rows);
  });
});

describe("POST /api/driver/documents — validation gates", () => {
  test("400 empty documents without consent (M-2)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);
    const res = await POST(jsonRequest({ documents: {} }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("400 vehicle_not_found when vehicle_id belongs to another driver (M-1)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP], []]);
    const res = await POST(jsonRequest({
      documents: { license_front: URL_OK },
      vehicle_id: VEHICLE_ID,
    }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("vehicle_not_found");
  });

  test("400 invalid_doc_type for keys outside the enum", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);
    const res = await POST(jsonRequest({ documents: { passport_scan: URL_OK } }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_doc_type");
  });

  test("400 invalid_storage_url for non-Ride storage hosts (C3a)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);
    (isAllowedStorageUrl as jest.Mock).mockReturnValue(false);
    const res = await POST(jsonRequest({ documents: { license_front: "https://evil.example/x.jpg" } }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_storage_url");
  });
});

describe("POST /api/driver/documents — submission", () => {
  test("201: advisory lock, soft-delete superseded rows, insert pending rows", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);

    const res = await POST(jsonRequest({
      documents: { license_front: URL_OK, license_back: URL_OK },
    }));
    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body).toEqual({ success: true, count: 2 });

    // N6: advisory lock ran before the soft-delete
    expect(advisoryLockRan).toBe(true);
    const softDelete = txUpdates.find((u) => u.table === documents);
    expect(softDelete).toBeDefined();
    expect(softDelete!.set.deleted_at).toBeInstanceOf(Date);

    const insert = txInserts.find((i) => i.table === documents);
    expect(insert).toBeDefined();
    const rows = insert!.values as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ driver_id: DRIVER_ID, doc_type: "license_front", status: "pending" });
  });

  test("legacy platform screenshot flags is_legacy_operator", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);

    await POST(jsonRequest({ documents: { legacy_screenshot: URL_OK } }));
    expect(driverUpdates.some((u) => u.set.is_legacy_operator === true)).toBe(true);
  });

  test("temporary driver drops to pending status after submission", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);

    await POST(jsonRequest({ documents: { license_front: URL_OK } }));
    expect(driverUpdates.some((u) => u.set.status === "pending")).toBe(true);
  });

  test("consent persisted with version + timestamp; consent-only submission allowed (M-9)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [DRIVER_TEMP]]);

    const res = await POST(jsonRequest({
      documents: {},
      consent_accepted: true,
      consent_version: "v2",
    }));
    expect(res.status).toBe(201);
    // no document rows were inserted (consent-only)
    expect(txInserts).toHaveLength(0);
    expect(driverUpdates.some((u) => u.set.consent_accepted === true && u.set.consent_version === "v2")).toBe(true);
  });
});
