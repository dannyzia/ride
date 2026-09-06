/**
 * P0-3 (gap ledger): admin fare-dispute resolution — PATCH branches (T-6).
 *
 * Money-path invariants:
 *  - review.write RBAC guard
 *  - approved + adjustment (or charged−claimed default) credits the rider
 *    wallet AND books a rider_wallet_transactions row inside the SAME
 *    transaction as the dispute resolution
 *  - rejected → refund 0 → NO wallet movement, NO ledger row, NO journal entry
 *  - adjustment is bounded (৳50,000 cap → 400 above it)
 *  - recordAdminRefund journal entry is non-blocking after commit
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/accounting", () => ({
  recordAdminRefund: jest.fn(),
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { recordAdminRefund } from "@/lib/accounting";
import { fareDisputes, users, riderWalletTransactions } from "@/src/db/schema";
import { GET, PATCH } from "@/app/api/admin/fare-disputes+api";

const DISPUTE_ID = "55555555-5555-4555-8555-555555555555";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function grantAdmin(allowed: boolean): void {
  (requireAdminPermission as jest.Mock).mockImplementation(() =>
    allowed
      ? jest.fn(async () => ({ supabaseUser: { id: "admin-uid" } }))
      : jest.fn(async () => {
          throw { status: 401 };
        }),
  );
}

function mockDisputeSelect(list: Row[] | null): void {
  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => list ?? []),
        orderBy: jest.fn(async () => list ?? []),
      })),
      orderBy: jest.fn(async () => list ?? []),
    })),
  }));
}

interface TxRecorder {
  userCreditSet: Row | null;
  ledgerValues: Row | null;
  disputeSet: Row | null;
}

function mockTransaction(): TxRecorder {
  const rec: TxRecorder = { userCreditSet: null, ledgerValues: null, disputeSet: null };
  const tx = {
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          if (table === users) rec.userCreditSet = setObj;
          if (table === fareDisputes) rec.disputeSet = setObj;
          return [];
        }),
      })),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((v: Row) => {
        if (table === riderWalletTransactions) rec.ledgerValues = v;
        return Promise.resolve([]);
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return rec;
}

const OPEN_DISPUTE: Row = {
  id: DISPUTE_ID,
  rider_id: RIDER_ID,
  charged_fare_bdt: 10_000,
  claimed_fare_bdt: 9_000,
  status: "under_review",
};

beforeEach(() => {
  jest.clearAllMocks();
  grantAdmin(true);
  (recordAdminRefund as jest.Mock).mockResolvedValue(undefined);
});

describe("PATCH /api/admin/fare-disputes", () => {
  test("401 when the review.write guard rejects", async () => {
    grantAdmin(false);
    const res = await PATCH(jsonRequest({ dispute_id: DISPUTE_ID, action: "admin_approved" }));
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("unauthorized");
  });

  test("400 validation_error above the ৳50,000 adjustment cap", async () => {
    const res = await PATCH(
      jsonRequest({ dispute_id: DISPUTE_ID, action: "admin_approved", adjustment_bdt: 5_000_001 }),
    );
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("404 not_found for an unknown dispute", async () => {
    mockDisputeSelect(null);
    const res = await PATCH(jsonRequest({ dispute_id: DISPUTE_ID, action: "admin_approved" }));
    expect(res.status).toBe(404);
  });

  test("admin_approved with explicit adjustment: wallet credit + ledger row + resolved + journal entry", async () => {
    mockDisputeSelect([OPEN_DISPUTE]);
    const rec = mockTransaction();

    const res = await PATCH(
      jsonRequest({ dispute_id: DISPUTE_ID, action: "admin_approved", adjustment_bdt: 2_500 }),
    );
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, resolution: "admin_approved", refund_bdt: 2_500 });

    expect(rec.userCreditSet).toBeDefined();
    expect(rec.ledgerValues).toMatchObject({ rider_id: RIDER_ID, amount_bdt: 2_500, transaction_type: "adjustment" });
    expect(rec.disputeSet).toMatchObject({
      status: "resolved",
      final_resolution: "admin_approved",
      admin_adjustment_bdt: 2_500,
    });
    expect(rec.disputeSet!.resolved_at).toBeDefined();
    expect(recordAdminRefund).toHaveBeenCalledWith(
      expect.objectContaining({ riderId: RIDER_ID, amountPaisa: 2_500 }),
    );
  });

  test("admin_approved WITHOUT adjustment defaults the refund to charged − claimed", async () => {
    mockDisputeSelect([OPEN_DISPUTE]);
    const rec = mockTransaction();

    const res = await PATCH(jsonRequest({ dispute_id: DISPUTE_ID, action: "admin_approved" }));
    expect(res.status).toBe(200);
    expect((await getJson(res)).refund_bdt).toBe(1_000);
    expect(rec.userCreditSet).toBeDefined();
    expect(rec.ledgerValues).toBeDefined();
    expect(recordAdminRefund).toHaveBeenCalled();
  });

  test("admin_rejected → zero refund, NO wallet movement and NO journal entry", async () => {
    mockDisputeSelect([OPEN_DISPUTE]);
    const rec = mockTransaction();

    const res = await PATCH(jsonRequest({ dispute_id: DISPUTE_ID, action: "admin_rejected" }));
    expect(res.status).toBe(200);
    expect((await getJson(res)).refund_bdt).toBe(0);

    expect(rec.userCreditSet).toBeNull();
    expect(rec.ledgerValues).toBeNull();
    expect(recordAdminRefund).not.toHaveBeenCalled();
    // dispute still resolves
    expect(rec.disputeSet).toMatchObject({ status: "resolved", final_resolution: "admin_rejected" });
  });
});

describe("GET /api/admin/fare-disputes", () => {
  test("returns disputes, optionally filtered by status", async () => {
    const rows = [{ id: DISPUTE_ID, status: "under_review" }];
    mockDisputeSelect(rows);

    const all = await GET(jsonRequest(undefined));
    expect(all.status).toBe(200);
    expect((await getJson(all)).disputes).toEqual(rows);

    const filtered = await GET(jsonRequest(undefined, "http://localhost/test?status=under_review"));
    expect(filtered.status).toBe(200);
    expect((await getJson(filtered)).disputes).toEqual(rows);
  });

  test("401 when the guard rejects", async () => {
    grantAdmin(false);
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(401);
  });
});
