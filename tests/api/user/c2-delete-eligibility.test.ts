/**
 * Account-deletion hardening (§A1/§A2/§A4).
 *
 * - `checkActiveCommitments` blocks deletion while any service vertical has a
 *   non-terminal booking, in every role the account holds.
 * - `checkDeleteEligibility` keeps dues as the first, more actionable block.
 * - The public web route (`delete-confirm`) verifies the deletion-scoped OTP,
 *   then applies the SAME preconditions and scrub writer as the app.
 * - `delete-otp` never reveals whether a number belongs to an account.
 */
jest.mock("@/lib/dprelay", () => ({
  verifyOtp: jest.fn(async () => ({ verified: true, phoneNumber: "+8801711111111" })),
  sendOtp: jest.fn(async () => ({
    sessionId: "sess-1",
    expiresAt: "2026-11-06T00:00:00.000Z",
  })),
}));
jest.mock("@/lib/devOtpBypass", () => ({
  isDevOtpBypassEnabled: () => false,
  consumeDevSession: jest.fn(() => null),
}));
jest.mock("@/lib/otpRateLimit", () => ({
  rateLimitCount: jest.fn(async () => 1),
  DELETE_OTP_VERIFY_MAX: 5,
  DELETE_OTP_PHONE_MAX: 3,
  DELETE_OTP_IP_MAX: 10,
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));

import { db } from "@/src/db";
import {
  awardedBidAssignments,
  courierRemittanceDues,
  deliveries,
  deliveryRequests,
  drivers,
  emergencyRequests,
  rentalRequests,
  rides,
  shopOrders,
} from "@/src/db/schema";
import { verifyOtp, sendOtp } from "@/lib/dprelay";
import { rateLimitCount } from "@/lib/otpRateLimit";
import {
  checkActiveCommitments,
  checkDeleteDues,
  checkDeleteEligibility,
} from "@/lib/accountDelete";
import { POST as deleteConfirm } from "@/app/api/user/delete-confirm+api";
import { POST as deleteOtp } from "@/app/api/user/delete-otp+api";

const USER_ID = "11111111-1111-4111-a111-111111111111";

function jsonRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Request;
}

/**
 * Fake tx that answers per-table, so a test names the vertical it exercises.
 * A fixture is either a plain row list, or `{ rows, aggregate }` when the same
 * table is queried both as an existence probe and as an aggregate — the
 * aggregate projection is detected by its `total` / `balance` key.
 */
type Fixture = unknown[] | { rows?: unknown[]; aggregate?: unknown[] };

function tableTx(fixtures: Array<[unknown, Fixture]> = []) {
  const map = new Map<unknown, Fixture>(fixtures);
  const sets: Record<string, unknown>[] = [];
  const rowsFor = (table: unknown, proj: unknown): unknown[] => {
    const f = map.get(table);
    if (Array.isArray(f)) return f;
    if (!f) return [];
    const isAggregate =
      !!proj && typeof proj === "object" && ("total" in proj || "balance" in proj);
    return isAggregate ? (f.aggregate ?? []) : (f.rows ?? []);
  };
  const chain = (table: unknown, proj: unknown): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rowsFor(table, proj);
    c.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
      Promise.resolve(rowsFor(table, proj)).then(res, rej);
    return c;
  };
  const tx = {
    select: (proj?: unknown) => ({ from: (table: unknown) => chain(table, proj) }),
    update: () => ({
      set: (s: Record<string, unknown>) => {
        sets.push(s);
        return { where: async () => undefined };
      },
    }),
  };
  return { tx, sets };
}

function useTx(fixtures: Array<[unknown, Fixture]> = []) {
  const fake = tableTx(fixtures);
  (db.transaction as jest.Mock).mockImplementationOnce(
    async (fn: (tx: unknown) => unknown) => fn(fake.tx),
  );
  return fake;
}

function mockUserLookup(rows: unknown[]) {
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows;
    return c;
  });
}

describe("checkActiveCommitments", () => {
  it("passes a clean account with no bookings", async () => {
    const { tx } = tableTx();
    await expect(checkActiveCommitments(tx as never, USER_ID)).resolves.toBeNull();
  });

  it("blocks a live ride", async () => {
    const { tx } = tableTx([[rides, [{ id: "r1" }]]]);
    await expect(checkActiveCommitments(tx as never, USER_ID)).resolves.toEqual({
      kind: "ride_active",
    });
  });

  it("blocks a live shop order on the merchant side", async () => {
    const { tx } = tableTx([[shopOrders, [{ id: "o1" }]]]);
    await expect(checkActiveCommitments(tx as never, USER_ID)).resolves.toEqual({
      kind: "shop_order_active",
    });
  });

  it("blocks a live rental award for the assigned driver", async () => {
    const { tx } = tableTx([
      [rentalRequests, []],
      [awardedBidAssignments, [{ id: "a1" }]],
    ]);
    await expect(checkActiveCommitments(tx as never, USER_ID)).resolves.toEqual({
      kind: "rental_active",
    });
  });

  it("blocks an in-flight emergency request", async () => {
    const { tx } = tableTx([[emergencyRequests, [{ id: "e1" }]]]);
    await expect(checkActiveCommitments(tx as never, USER_ID)).resolves.toEqual({
      kind: "emergency_active",
    });
  });

  it("blocks a live delivery leg", async () => {
    const { tx } = tableTx([
      [deliveries, [{ id: "d1" }]],
      [deliveryRequests, []],
    ]);
    await expect(checkActiveCommitments(tx as never, USER_ID)).resolves.toEqual({
      kind: "delivery_active",
    });
  });

  it("blocked by dues wins over a live booking (most actionable reason first)", async () => {
    const { tx } = tableTx([
      [courierRemittanceDues, [{ total: 500 }]],
      [rides, [{ id: "r1" }]],
    ]);
    await expect(checkDeleteEligibility(tx as never, USER_ID)).resolves.toEqual({
      type: "dues",
      dues: { kind: "courier_remittance", amount_bdt: 500 },
    });
  });
});

/**
 * Driver commission is NET of completed settlements. Summing gross commission
 * used to block every driver who had ever completed a commissioned ride, even
 * after paying it off — the gate must read accrued − settled.
 *
 * The gate reads net dues from the `operator_unpaid_obligations` view through
 * `tx.execute` (Batch-2 Item 4); the view floors at zero server-side. This
 * fake mirrors that contract: accrued − settled, floored at zero.
 */
function settledDriver(accrued: number, settled: number) {
  const fake = tableTx([[drivers, { rows: [{ id: "d1" }] }]]);
  const net = Math.max(0, accrued - settled);
  (fake.tx as unknown as { execute: (query: unknown) => Promise<unknown[]> }).execute =
    async () => [
      {
        unpaid_subscription_paisa: 0,
        net_commission_paisa: net,
        total_unpaid_paisa: net,
        active_self_bill_paisa: 0,
        lockout_exposure_paisa: 0,
      },
    ];
  return fake;
}

describe("driver commission dues are net of settlements", () => {
  it("fully settled commission does not block deletion", async () => {
    const { tx } = settledDriver(8000, 8000);
    await expect(checkDeleteEligibility(tx as never, USER_ID)).resolves.toBeNull();
  });

  it("partially settled commission blocks on the remainder only", async () => {
    const { tx } = settledDriver(8000, 5000);
    await expect(checkDeleteEligibility(tx as never, USER_ID)).resolves.toEqual({
      type: "dues",
      dues: { kind: "driver_commission", amount_bdt: 3000 },
    });
  });

  it("over-settlement floors at zero rather than crediting the driver", async () => {
    const { tx } = settledDriver(2000, 5000);
    await expect(checkDeleteDues(tx as never, USER_ID)).resolves.toBeNull();
  });
});

describe("POST /api/user/delete-confirm (web portal)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (rateLimitCount as jest.Mock).mockImplementation(async () => 1);
    (verifyOtp as jest.Mock).mockImplementation(async () => ({
      verified: true,
      phoneNumber: "+8801711111111",
    }));
  });

  it("scrubs the account when the OTP matches and nothing blocks", async () => {
    mockUserLookup([{ id: USER_ID }]);
    const { sets } = useTx();

    const res = await deleteConfirm(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // users + rider_addresses + rides, same writer as the in-app delete.
    expect(sets).toHaveLength(3);
    expect(String(sets[0].phone)).toMatch(/^deleted:/);
    expect(sets[0].deleted_at).toBeInstanceOf(Date);
  });

  it("409s with the outstanding paisa amount when dues block deletion", async () => {
    mockUserLookup([{ id: USER_ID }]);
    useTx([[courierRemittanceDues, [{ total: 2500 }]]]);

    const res = await deleteConfirm(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "dues_outstanding",
      message: "Outstanding dues must be settled before deletion",
      kind: "courier_remittance",
      amount_bdt: 2500,
    });
  });

  it("409s with the blocking booking kind", async () => {
    mockUserLookup([{ id: USER_ID }]);
    useTx([[rides, [{ id: "r1" }]]]);

    const res = await deleteConfirm(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("active_booking");
    expect(body.kind).toBe("ride_active");
  });

  it("404s once the number no longer resolves (tombstoned = replay-safe)", async () => {
    mockUserLookup([]);
    const res = await deleteConfirm(jsonRequest({ sessionId: "sess-2", otp: "123456" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("account_not_found");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("400s on a wrong code without touching the account", async () => {
    mockUserLookup([{ id: USER_ID }]);
    (verifyOtp as jest.Mock).mockImplementationOnce(async () => ({
      verified: false,
      phoneNumber: "",
    }));
    const res = await deleteConfirm(jsonRequest({ sessionId: "sess-1", otp: "000000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_otp");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("400s once the brute-force cap is exceeded", async () => {
    (rateLimitCount as jest.Mock).mockImplementationOnce(async () => 6);
    const res = await deleteConfirm(jsonRequest({ sessionId: "sess-1", otp: "123456" }));
    expect(res.status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /api/user/delete-otp (web portal)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (rateLimitCount as jest.Mock).mockImplementation(async () => 1);
  });

  it("returns a challenge without revealing whether the number has an account", async () => {
    const res = await deleteOtp(jsonRequest({ phone: "+8801711111111" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId: "sess-1",
      expiresAt: "2026-11-06T00:00:00.000Z",
    });
    expect(sendOtp).toHaveBeenCalledWith("+8801711111111");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("429s when the phone request cap is exceeded", async () => {
    (rateLimitCount as jest.Mock).mockImplementationOnce(async () => 4);
    const res = await deleteOtp(jsonRequest({ phone: "+8801711111111" }));
    expect(res.status).toBe(429);
    expect(sendOtp).not.toHaveBeenCalled();
  });
});
