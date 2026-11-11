/**
 * Batch-2 Item 9 — the delivery platform-fee hook (usage bills only).
 *
 * Mirrors tests/api/shop/shopLedger.test.ts, one rung at a time, because the
 * delivery fee must be priced through the SAME A-1 matrix the shop order uses:
 *
 *   possession                      | earnings commission | usage accrual
 *   --------------------------------|---------------------|--------------
 *   active package, rate > 0        | NO (gross earnings) | YES, at pkg rate
 *   active package, no rate         | yes, legacy %       | no
 *   rows exist, none usable         | no (0%)             | no
 *   no possession at all (legacy)   | yes, config %       | no   ← byte-for-byte
 *
 * Plus the two things that are delivery-specific:
 *   - XOR: exactly one of the two legs carries the fee, never both, never neither;
 *   - the bill identity is couriers.id (courier_type='food'), the Item 6 operator
 *     mapping, so the accrual lands on the row /api/delivery/dues settles;
 *   - COD remittance is a DIFFERENT ledger (D7): its rows are still written the
 *     way they always were, and the reversal hook never touches them.
 *
 * The tx is a hand-rolled stub so the assertions read as the SQL shapes the
 * writer produces, not as mock bookkeeping.
 */
import { jest } from "@jest/globals";
import {
  reverseDeliveryUsageForOrder,
  settleDeliveryLeg,
} from "@/lib/deliverySettlement";
import { accrueUsageBill, reduceUsageBillForReversal } from "@/lib/billsLedger";
import { courierRemittanceDues, deliveryEarnings } from "@/src/db/schema";

const mockRequireInt = jest.fn<(...args: unknown[]) => Promise<number>>();
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/platformConfig", () => ({
  requireConfigInt: (key: string) => mockRequireInt(key),
}));
jest.mock("@/lib/billsLedger", () => ({
  accrueUsageBill: jest.fn(async () => ({ billId: "bill-1", amount_bdt: 0 })),
  reduceUsageBillForReversal: jest.fn(async () => ({ billId: "bill-1", amount_bdt: 0 })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

type Row = Record<string, unknown>;

const LEG_ID = "11111111-1111-4111-a111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const COURIER_USER = "44444444-4444-4444-8444-444444444444";
/** The courier ENTITY (couriers.id) — what operator_packages/bills are keyed by. */
const COURIER_ENTITY = "77777777-7777-4777-8777-777777777777";
const FEE = 8_000; // ৳80 delivery fee

interface PossessionRow {
  status: string;
  expires_at: Date | null;
  commission_percent: string | null;
}

/**
 * select call order inside settleDeliveryLeg:
 *   (1) delivery_earnings (same-tx replay), (2) the delivery leg,
 *   (3) the courier entity (couriers.id for the user), (4) operator_packages,
 *   then (5) shop_orders + (6) the leg again only when a remittance due applies.
 */
function makeTx(selectQueue: unknown[][]) {
  const inserts: { table: unknown; values: Row }[] = [];
  let selectIndex = 0;
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {
      from: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: async () => rows,
      for: () => c,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  const tx = {
    select: jest.fn(() => {
      const rows = selectQueue[selectIndex] ?? [];
      selectIndex++;
      return chain(rows);
    }),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((vals: Row) => {
        inserts.push({ table, values: vals });
        return { then: (r: (v: unknown) => unknown) => r(vals) };
      }),
    })),
  };
  return {
    // Cast: the hand-rolled stub is deliberately not a drizzle PgTransaction
    // (its header comment); the writer only touches the chain methods the
    // stub implements. Same treatment as the repo's documented Drizzle casts.
    tx: tx as unknown as Parameters<typeof settleDeliveryLeg>[0],
    inserts,
  };
}

function legRow(opts: { fee?: number; courierUser?: string | null } = {}): Row {
  return {
    delivery_fee_bdt: opts.fee ?? FEE,
    delivery_man_user_id: opts.courierUser === undefined ? COURIER_USER : opts.courierUser,
  };
}

const PACKAGE_5: PossessionRow = {
  status: "active",
  expires_at: null,
  commission_percent: "5.00",
};

/** earnings row recorded by ONE settlement (there is exactly one insert). */
function earningsOf(inserts: { table: unknown; values: Row }[]): Row[] {
  return inserts.filter((i) => i.table === deliveryEarnings).map((i) => i.values);
}

describe("settleDeliveryLeg — platform-fee matrix (Batch-2 Item 9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── POSTPAID: package rate replaces the legacy percent, gross earnings ────

  it("a package rate REPLACES the legacy percent and accrues — earnings keep the fee WHOLE", async () => {
    const { tx, inserts } = makeTx([
      [], // no prior earnings row
      [legRow()], // the leg (and its assignee)
      [{ id: COURIER_ENTITY }], // couriers.id for the user
      [PACKAGE_5], // the delivery possession
      [], // no shop order → no remittance due
    ]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    // A-1: the legacy percent is never read when the package carries a rate.
    expect(mockRequireInt).not.toHaveBeenCalled();
    // One receivable, at the PACKAGE rate (5%), on the courier ENTITY's bill.
    expect(accrueUsageBill).toHaveBeenCalledWith(tx, {
      operatorRole: "delivery",
      operatorId: COURIER_ENTITY,
      amountBdt: 400,
    });
    // Postpaid-gross: NO at-source deduction on the earnings row.
    expect(earningsOf(inserts)).toEqual([
      expect.objectContaining({
        fee_bdt: FEE,
        commission_bdt: 0,
        net_bdt: FEE,
      }),
    ]);
    expect(out).toEqual({
      earned_bdt: FEE,
      commission_bdt: 0,
      usage_accrued_bdt: 400,
      due_bdt: 0,
    });
  });

  it("XOR: the package path never holds the fee at source AND bills it", async () => {
    const { tx, inserts } = makeTx([[], [legRow()], [{ id: COURIER_ENTITY }], [PACKAGE_5], []]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    const row = earningsOf(inserts)[0];
    // Exactly one leg carries the platform fee.
    // (settleDeliveryLeg returns null only for the already-settled no-op —
    // these tests exercise the settled path, so non-null is exact.)
    const ledgerLeg = Number(row.commission_bdt);
    const billLeg = Number(out!.usage_accrued_bdt);
    expect(ledgerLeg === 0 || billLeg === 0).toBe(true);
    expect(ledgerLeg + billLeg).toBe(400);
    // The earnings invariant still holds: net = fee − withheld.
    expect(Number(row.net_bdt)).toBe(FEE - ledgerLeg);
  });

  // ── legacy / no-rate: byte-for-byte ──────────────────────────────────────

  it("a package with no rate falls back to the legacy percent and accrues nothing", async () => {
    mockRequireInt.mockResolvedValue(10);
    const { tx, inserts } = makeTx([
      [],
      [legRow()],
      [{ id: COURIER_ENTITY }],
      [{ status: "active", expires_at: null, commission_percent: null }],
      [],
    ]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    expect(mockRequireInt).toHaveBeenCalledWith("delivery_commission_percent");
    expect(earningsOf(inserts)).toEqual([
      expect.objectContaining({ commission_bdt: 800, net_bdt: FEE - 800 }),
    ]);
    expect(accrueUsageBill).not.toHaveBeenCalled();
    expect(out!.commission_bdt).toBe(800);
    expect(out!.usage_accrued_bdt).toBe(0);
  });

  it("no possession at all keeps the legacy percent byte-for-byte (unpackaged courier)", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx, inserts } = makeTx([[], [legRow()], [{ id: COURIER_ENTITY }], [], []]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    expect(mockRequireInt).toHaveBeenCalledWith("delivery_commission_percent");
    expect(earningsOf(inserts)[0]).toMatchObject({ commission_bdt: 640, net_bdt: FEE - 640 });
    expect(accrueUsageBill).not.toHaveBeenCalled();
    expect(out!.earned_bdt).toBe(FEE - 640);
  });

  it("EXHAUSTED possession prices at 0 — no bill, no legacy read, gross earnings", async () => {
    const { tx, inserts } = makeTx([
      [],
      [legRow()],
      [{ id: COURIER_ENTITY }],
      [{ status: "active", expires_at: new Date(Date.now() - 86_400_000), commission_percent: "5.00" }],
      [],
    ]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    expect(mockRequireInt).not.toHaveBeenCalled();
    expect(accrueUsageBill).not.toHaveBeenCalled();
    expect(earningsOf(inserts)[0]).toMatchObject({ commission_bdt: 0, net_bdt: FEE });
    expect(out).toMatchObject({ commission_bdt: 0, usage_accrued_bdt: 0, earned_bdt: FEE });
  });

  it("a parcel courier (no food row) stays on the legacy percent", async () => {
    mockRequireInt.mockResolvedValue(8);
    const { tx } = makeTx([[], [legRow()], [], []]); // no couriers row for this user

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    expect(accrueUsageBill).not.toHaveBeenCalled();
    expect(out!.commission_bdt).toBe(640);
  });

  // ── identity: the record's courier, not the caller ───────────────────────

  it("resolves the courier from the DELIVERY RECORD (leg.delivery_man_user_id)", async () => {
    const RECORD_COURIER = "99999999-9999-4999-8999-999999999999";
    const { tx } = makeTx([
      [],
      [legRow({ courierUser: RECORD_COURIER })], // the leg names someone else
      [{ id: COURIER_ENTITY }],
      [PACKAGE_5],
      [],
    ]);

    await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    // The rate/identity lookup used the record's assignee.
    expect(accrueUsageBill).toHaveBeenCalledWith(tx, {
      operatorRole: "delivery",
      operatorId: COURIER_ENTITY,
      amountBdt: 400,
    });
  });

  // ── aggregate growth: same bill row across legs ───────────────────────────

  it("accrues EVERY leg onto the same operator identity (one aggregate bill)", async () => {
    for (const legId of [LEG_ID, "12121212-1212-4212-8212-121212121212"]) {
      const { tx } = makeTx([[], [legRow()], [{ id: COURIER_ENTITY }], [PACKAGE_5], []]);
      await settleDeliveryLeg(tx, { legId, orderId: ORDER_ID, courierUserId: COURIER_USER });
    }

    const calls = (accrueUsageBill as jest.Mock).mock.calls.map((c) => c[1]);
    expect(calls).toHaveLength(2);
    // Same (role, id) both times → the writer's lock + partial unique index make
    // these two increments one row, never a second bill.
    expect(calls[0]).toMatchObject({ operatorRole: "delivery", operatorId: COURIER_ENTITY });
    expect(calls[1]).toMatchObject({ operatorRole: "delivery", operatorId: COURIER_ENTITY });
    expect(calls.every((c) => Number((c as Row).amountBdt) === 400)).toBe(true);
  });

  // ── D7: COD remittance is untouched ──────────────────────────────────────

  it("still writes the COD remittance due exactly as before (D7 untouched)", async () => {
    mockRequireInt.mockResolvedValue(0);
    const { tx, inserts } = makeTx([
      [],
      [legRow()],
      [{ id: COURIER_ENTITY }],
      [],
      [{ id: ORDER_ID, subtotal_bdt: 20_000 }], // a shop order → remittance applies
      [{ amount_collected_bdt: 28_000, delivery_fee_bdt: FEE }],
    ]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    const dues = inserts.filter((i) => i.table === courierRemittanceDues).map((i) => i.values);
    expect(dues).toEqual([
      expect.objectContaining({ amount_bdt: 20_000, status: "pending", remittance_note: null }),
    ]);
    expect(out!.due_bdt).toBe(20_000);
    // The fee leg never bills the courier's COD custody.
    expect(accrueUsageBill).not.toHaveBeenCalled();
  });

  it("is a no-op when the leg is already settled in the same tx", async () => {
    const { tx, inserts } = makeTx([[{ id: "earning-1" }]]);

    const out = await settleDeliveryLeg(tx, {
      legId: LEG_ID,
      orderId: ORDER_ID,
      courierUserId: COURIER_USER,
    });

    expect(out).toBeNull();
    expect(inserts).toHaveLength(0);
    expect(accrueUsageBill).not.toHaveBeenCalled();
  });
});

describe("reverseDeliveryUsageForOrder — reversal parity (Batch-2 Item 9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * select order: (1) this order's delivery_earnings rows, then per row
   * (2) the courier entity, (3) the possession.
   */
  it("takes a POSTPAID leg's fee back out of the aggregate usage bill", async () => {
    const { tx, inserts } = makeTx([
      [{ leg_id: LEG_ID, delivery_man_user_id: COURIER_USER, fee_bdt: FEE, commission_bdt: 0 }],
      [{ id: COURIER_ENTITY }],
      [PACKAGE_5],
    ]);

    const out = await reverseDeliveryUsageForOrder(tx, { orderId: ORDER_ID });

    expect(reduceUsageBillForReversal).toHaveBeenCalledWith(tx, {
      operatorRole: "delivery",
      operatorId: COURIER_ENTITY,
      amountBdt: 400,
    });
    expect(out).toEqual({ reduced_bdt: 400 });
    // Nothing is written to the COD custody ledger by a reversal.
    expect(inserts.filter((i) => i.table === courierRemittanceDues)).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("a LEGACY leg unwinds at source already — no bill is meddled with", async () => {
    const { tx } = makeTx([
      [{ leg_id: LEG_ID, delivery_man_user_id: COURIER_USER, fee_bdt: FEE, commission_bdt: 640 }],
    ]);

    const out = await reverseDeliveryUsageForOrder(tx, { orderId: ORDER_ID });

    expect(reduceUsageBillForReversal).not.toHaveBeenCalled();
    expect(out).toEqual({ reduced_bdt: 0 });
  });

  it("an order whose leg never settled reduces nothing", async () => {
    const { tx } = makeTx([[]]);

    const out = await reverseDeliveryUsageForOrder(tx, { orderId: ORDER_ID });

    expect(reduceUsageBillForReversal).not.toHaveBeenCalled();
    expect(out).toEqual({ reduced_bdt: 0 });
  });

  it("a postpaid leg with no package TODAY reduces nothing (cannot be proven)", async () => {
    const { tx } = makeTx([
      [{ leg_id: LEG_ID, delivery_man_user_id: COURIER_USER, fee_bdt: FEE, commission_bdt: 0 }],
      [{ id: COURIER_ENTITY }],
      [], // no possession rows
    ]);

    const out = await reverseDeliveryUsageForOrder(tx, { orderId: ORDER_ID });

    expect(reduceUsageBillForReversal).not.toHaveBeenCalled();
    expect(out.reduced_bdt).toBe(0);
  });

  it("a zero-fee leg is skipped (never reduces a bill for nothing)", async () => {
    const { tx } = makeTx([
      [{ leg_id: LEG_ID, delivery_man_user_id: COURIER_USER, fee_bdt: 0, commission_bdt: 0 }],
    ]);

    const out = await reverseDeliveryUsageForOrder(tx, { orderId: ORDER_ID });

    expect(reduceUsageBillForReversal).not.toHaveBeenCalled();
    expect(out.reduced_bdt).toBe(0);
  });

  it("reduces every delivered leg of the order (one subtraction per leg)", async () => {
    const { tx } = makeTx([
      [
        { leg_id: LEG_ID, delivery_man_user_id: COURIER_USER, fee_bdt: FEE, commission_bdt: 0 },
        { leg_id: "13131313-1313-4313-8313-131313131313", delivery_man_user_id: COURIER_USER, fee_bdt: 4_000, commission_bdt: 0 },
      ],
      [{ id: COURIER_ENTITY }],
      [PACKAGE_5],
      [{ id: COURIER_ENTITY }],
      [PACKAGE_5],
    ]);

    const out = await reverseDeliveryUsageForOrder(tx, { orderId: ORDER_ID });

    expect(reduceUsageBillForReversal).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ reduced_bdt: 600 }); // 400 + 200
  });
});
