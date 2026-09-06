/**
 * P1-20 (gap ledger): admin verification queue — pending list, approve,
 * reject. Owner decision D-2 asserted: approving a document ONLY sets its
 * status (no automatic driver activation). Reject persists the reason.
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { documents } from "@/src/db/schema";
import { GET as pendingGET } from "@/app/api/admin/documents/pending+api";
import { POST as approvePOST } from "@/app/api/admin/documents/approve+api";
import { POST as rejectPOST } from "@/app/api/admin/documents/reject+api";

const DOC_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function grantAdmin(allowed: boolean): void {
  (requireAdminPermission as jest.Mock).mockImplementation(() =>
    allowed
      ? jest.fn(async () => ({ dbUser: { id: ADMIN_ID, role: "admin" } }))
      : jest.fn(async () => {
          throw { status: 403 };
        }),
  );
}

const updates: { table: unknown; set: Row }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  updates.length = 0;
  grantAdmin(true);
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(async () => {
        updates.push({ table, set: setObj });
        return [];
      }),
    })),
  }));
});

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

describe("GET /api/admin/documents/pending", () => {
  test("403 when the verification.write guard rejects", async () => {
    grantAdmin(false);
    const res = await pendingGET(jsonRequest());
    expect(res.status).toBe(403);
  });

  test("returns pending documents with driver names", async () => {
    const rows = [{ id: DOC_ID, document_type: "license_front", driver_name: "Kamal" }];
    mockSelectQueue([rows]);

    const res = await pendingGET(jsonRequest());
    expect(res.status).toBe(200);
    expect((await getJson(res))).toEqual(rows);
  });
});

describe("POST /api/admin/documents/approve", () => {
  test("400 validation_error for a non-uuid documentId", async () => {
    const res = await approvePOST(jsonRequest({ documentId: "abc" }));
    expect(res.status).toBe(400);
  });

  test("404 document_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await approvePOST(jsonRequest({ documentId: DOC_ID }));
    expect(res.status).toBe(404);
  });

  test("approves ONLY the document status — never activates the driver (D-2)", async () => {
    mockSelectQueue([[{ id: DOC_ID, driver_id: "d-1", status: "pending" }], []]);

    const res = await approvePOST(jsonRequest({ documentId: DOC_ID }));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.success).toBe(true);
    expect(body.vehicle_age_days).toBeNull(); // no vehicle registration on record

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(documents);
    expect(updates[0].set).toMatchObject({ status: "approved", reviewed_by: ADMIN_ID });
    expect(updates[0].set.reviewed_at).toBeInstanceOf(Date);
    // D-2: no drivers-table write anywhere in the request
    expect(updates.some((u) => u.table !== documents)).toBe(false);
  });

  test("reports vehicle age informationally when registration_date exists", async () => {
    const tenYearsAgo = new Date(Date.now() - 10 * 365 * 86_400_000);
    mockSelectQueue([[{ id: DOC_ID, driver_id: "d-1", status: "pending" }], [{ registration_date: tenYearsAgo }]]);

    const res = await approvePOST(jsonRequest({ documentId: DOC_ID }));
    const body = await getJson(res);
    expect(body.vehicle_age_days).toBeGreaterThan(3_000);
  });
});

describe("POST /api/admin/documents/reject", () => {
  test("400 validation_error when the reason is empty", async () => {
    const res = await rejectPOST(jsonRequest({ documentId: DOC_ID, reason: "" }));
    expect(res.status).toBe(400);
  });

  test("404 document_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await rejectPOST(jsonRequest({ documentId: DOC_ID, reason: "blurry" }));
    expect(res.status).toBe(404);
  });

  test("rejects with the reason and reviewer attribution", async () => {
    mockSelectQueue([[{ id: DOC_ID, status: "pending" }]]);

    const res = await rejectPOST(jsonRequest({ documentId: DOC_ID, reason: "blurry photo" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(updates[0].table).toBe(documents);
    expect(updates[0].set).toMatchObject({
      status: "rejected",
      reviewed_by: ADMIN_ID,
      rejection_reason: "blurry photo",
    });
  });
});
