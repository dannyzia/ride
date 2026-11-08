/**
 * Batch-2 Item 7 — statement + settlement core.
 *
 * Pinned:
 *   - statement figures come from the view; bills are itemized into
 *     subscription vs usage/commission; headroom = ceiling - owed, floored at 0;
 *   - state precedence NO_PRODUCT > LAPSED > OWING > ACTIVE (no CEILING_LOCKED,
 *     no PRODUCT_FROZEN — both deliberately absent for non-driver operators);
 *   - settlement resolves the single open bill, asserts the M-09 floor, creates
 *     the event with user_id (driver_id NULL) and stamps the bill under
 *     `purchase_bill_<role>:<id>`;
 *   - a retry overwrites the stamp with its own event id.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/commissionDues", () => ({ getOperatorUnpaidObligations: jest.fn() }));
jest.mock("@/lib/platformConfig", () => ({ getDebtCeilingForRole: jest.fn() }));
jest.mock("@/lib/paymentEvents", () => ({ initiatePortposPayment: jest.fn() }));
jest.mock("@/lib/operatorPurchase", () => ({ DUST_DUES_PAISA: 1_000 }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { getOperatorUnpaidObligations } from "@/lib/commissionDues";
import { getDebtCeilingForRole } from "@/lib/platformConfig";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import {
  getOperatorStatement,
  initiateOperatorSettlement,
  OperatorSettlementError,
} from "@/lib/operatorSettlement";

const OP_ID = "abcd1111-abcd-4abc-8abc-abcd11111111";
const BILL_ID = "b1111111-1111-4111-8111-111111111111";
const NOW = Date.now();
const PAST = new Date(NOW - 86_400_000);
const FUTURE = new Date(NOW + 86_400_000);

type Row = Record<string, unknown>;

function obligations(total: number) {
  return {
    unpaidSubscriptionPaisa: total,
    netCommissionPaisa: 0,
    totalUnpaidPaisa: total,
    activeSelfBillPaisa: 0,
    lockoutExposurePaisa: total,
  };
}

function billRow(overrides: Row = {}): Row {
  return {
    id: BILL_ID,
    kind: "subscription_purchase",
    amount_bdt: 5_000,
    due_at: FUTURE,
    created_at: new Date(NOW),
    ...overrides,
  };
}

function mockSelectQueue(queue: Row[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[i] ?? [];
    i++;
    const chain: Record<string, unknown> = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      for: () => chain,
      limit: async () => rows,
      then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

let txUpdate: jest.Mock;
let stampedValues: Row[];
let txExecute: jest.Mock;
let txSelectRows: Row[][];
let txSelectIndex: number;

async function expectSettlementCode(
  promise: Promise<unknown>,
  code: string,
): Promise<OperatorSettlementError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(OperatorSettlementError);
    const err = e as OperatorSettlementError;
    expect(err.code).toBe(code);
    return err;
  }
  throw new Error(`expected OperatorSettlementError ${code}, resolved instead`);
}

beforeEach(() => {
  jest.clearAllMocks();
  (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(5_000));
  (getDebtCeilingForRole as jest.Mock).mockResolvedValue(50_000);
  (initiatePortposPayment as jest.Mock).mockResolvedValue({
    payment_url: "https://gateway.example/inv-1",
    payment_event_id: "evt-1",
  });

  stampedValues = [];
  txUpdate = jest.fn(() => ({
    set: (values: Row) => {
      stampedValues.push(values);
      return { where: async () => undefined };
    },
  }));
  txExecute = jest.fn(async (_statement: unknown) => [] as unknown[]);
  txSelectRows = [];
  txSelectIndex = 0;
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      execute: txExecute,
      update: txUpdate,
      select: jest.fn(() => {
        const rows = txSelectRows[txSelectIndex] ?? [];
        txSelectIndex++;
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          for: () => chain,
          limit: async () => rows,
        };
        return chain;
      }),
    }),
  );
});

describe("getOperatorStatement", () => {
  test("NO_PRODUCT — no possession, nothing owed", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(0));
    mockSelectQueue([[], []]);

    const statement = await getOperatorStatement("shop", OP_ID);

    expect(statement.state).toBe("NO_PRODUCT");
    expect(statement.credit_headroom_paisa).toBe(50_000);
    expect(statement.open_subscription_bills).toEqual([]);
    expect(statement.open_usage_bills).toEqual([]);
  });

  test("LAPSED — an expired possession outranks the owed figure", async () => {
    mockSelectQueue([[billRow()], [{ package_id: "pkg-1", name: "Starter", started_at: PAST, expires_at: PAST }]]);

    const statement = await getOperatorStatement("shop", OP_ID);

    expect(statement.state).toBe("LAPSED");
    expect(statement.total_unpaid_paisa).toBe(5_000);
    expect(statement.active_package).toMatchObject({ package_id: "pkg-1" });
  });

  test("OWING — active possession and >= ৳10 outstanding", async () => {
    mockSelectQueue([[billRow()], [{ package_id: "pkg-1", name: "Starter", started_at: PAST, expires_at: null }]]);

    const statement = await getOperatorStatement("delivery", OP_ID);

    expect(statement.state).toBe("OWING");
    expect(statement.credit_headroom_paisa).toBe(45_000);
  });

  test("ACTIVE — active possession, dust outstanding", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(500));
    mockSelectQueue([
      [billRow({ amount_bdt: 500 })],
      [{ package_id: "pkg-1", name: "Starter", started_at: PAST, expires_at: FUTURE }],
    ]);

    const statement = await getOperatorStatement("fleet", OP_ID);

    expect(statement.state).toBe("ACTIVE");
    expect(statement.total_unpaid_paisa).toBe(500);
  });

  test("headroom floors at zero when the operator is over the ceiling", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(60_000));
    mockSelectQueue([[], [{ package_id: "pkg-1", name: "Starter", started_at: PAST, expires_at: null }]]);

    const statement = await getOperatorStatement("shop", OP_ID);

    expect(statement.credit_headroom_paisa).toBe(0);
    expect(statement.debt_ceiling_paisa).toBe(50_000);
  });

  test("bills are split into subscription and usage/commission lists", async () => {
    (getOperatorUnpaidObligations as jest.Mock).mockResolvedValue(obligations(8_000));
    mockSelectQueue([
      [
        billRow(),
        billRow({ id: "usage-1", kind: "usage", amount_bdt: 3_000 }),
      ],
      [{ package_id: "pkg-1", name: "Starter", started_at: PAST, expires_at: null }],
    ]);

    const statement = await getOperatorStatement("shop", OP_ID);

    expect(statement.open_subscription_bills).toHaveLength(1);
    expect(statement.open_usage_bills).toHaveLength(1);
    expect(statement.open_usage_bills[0]).toMatchObject({ id: "usage-1", kind: "usage" });
  });
});

describe("initiateOperatorSettlement", () => {
  test("creates the event with user_id and NO driver_id, then stamps the bill under the purchase lock", async () => {
    mockSelectQueue([[{ id: BILL_ID, amount_bdt: 5_000, status: "open" }]]);
    txSelectRows = [[{ id: BILL_ID, amount_bdt: 5_000, status: "open" }]];

    const result = await initiateOperatorSettlement({
      operatorRole: "shop",
      operatorId: OP_ID,
      userId: "user-1",
      serverUrl: "https://ride.example",
      customer: { name: "Owner", email: "o@example.com", phone: "017" },
    });

    expect(result).toMatchObject({
      billId: BILL_ID,
      paymentEventId: "evt-1",
      amountBdt: 5_000,
      payment_url: "https://gateway.example/inv-1",
    });
    expect(initiatePortposPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        amount_bdt: 5_000,
        purpose: "subscription_settlement",
      }),
    );
    expect((initiatePortposPayment as jest.Mock).mock.calls[0][0]).not.toHaveProperty("driver_id");

    const lock = new PgDialect().sqlToQuery(txExecute.mock.calls[0][0] as never);
    expect(lock.params).toContain(`purchase_bill_shop:${OP_ID}`);

    expect(stampedValues).toHaveLength(1);
    expect(stampedValues[0]).toMatchObject({ payment_event_id: "evt-1" });
  });

  test("a retry stamps its OWN event id over the previous one", async () => {
    (initiatePortposPayment as jest.Mock)
      .mockResolvedValueOnce({ payment_url: "u1", payment_event_id: "evt-A" })
      .mockResolvedValueOnce({ payment_url: "u2", payment_event_id: "evt-B" });
    mockSelectQueue([
      [{ id: BILL_ID, amount_bdt: 5_000, status: "open" }],
      [{ id: BILL_ID, amount_bdt: 5_000, status: "open" }],
    ]);
    txSelectRows = [
      [{ id: BILL_ID, amount_bdt: 5_000, status: "open" }],
      [{ id: BILL_ID, amount_bdt: 5_000, status: "open" }],
    ];

    await initiateOperatorSettlement({ operatorRole: "fleet", operatorId: OP_ID, userId: "u", serverUrl: "" });
    await initiateOperatorSettlement({ operatorRole: "fleet", operatorId: OP_ID, userId: "u", serverUrl: "" });

    expect(stampedValues).toHaveLength(2);
    expect(stampedValues[0]).toMatchObject({ payment_event_id: "evt-A" });
    expect(stampedValues[1]).toMatchObject({ payment_event_id: "evt-B" });
  });

  test("no open bill → typed no_open_bill, no invoice", async () => {
    mockSelectQueue([[]]);

    const err = await expectSettlementCode(
      initiateOperatorSettlement({ operatorRole: "shop", operatorId: OP_ID, userId: "u", serverUrl: "" }),
      "no_open_bill",
    );
    expect(err.status).toBe(400);
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("a bill under the ৳10 floor is refused structurally (M-09 bypass)", async () => {
    mockSelectQueue([[{ id: BILL_ID, amount_bdt: 500, status: "open" }]]);

    await expectSettlementCode(
      initiateOperatorSettlement({ operatorRole: "shop", operatorId: OP_ID, userId: "u", serverUrl: "" }),
      "amount_below_minimum",
    );
    expect(initiatePortposPayment).not.toHaveBeenCalled();
  });

  test("a bill that disappears before the stamp aborts with 409 and no stamp", async () => {
    mockSelectQueue([[{ id: BILL_ID, amount_bdt: 5_000, status: "open" }]]);
    txSelectRows = [[]];

    const err = await expectSettlementCode(
      initiateOperatorSettlement({ operatorRole: "shop", operatorId: OP_ID, userId: "u", serverUrl: "" }),
      "no_open_bill",
    );
    expect(err.status).toBe(409);
    expect(txUpdate).not.toHaveBeenCalled();
  });
});
