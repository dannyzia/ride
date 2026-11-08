/**
 * Batch-2 Item 7 — GET/POST /api/{shop,delivery,fleet}/dues.
 *
 * The core (statement shape, state precedence, stamping) is covered by
 * tests/lib/operator-settlement.test.ts; these pin the route wiring: role
 * eligibility before any core call, the gateway/payments gates, the operator
 * identity passed to the core, and the typed-error → status mapping.
 */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supa-user-1" })),
}));
jest.mock("@/lib/launchRoles", () => ({
  heldRoles: jest.fn(async () => [{ role: "shop_owner", status: "active" }]),
}));
jest.mock("@/lib/portpos", () => ({ isConfigured: jest.fn(() => true) }));
jest.mock("@/lib/platformConfig", () => ({ getPlan05Bool: jest.fn(async () => true) }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/operatorSettlement", () => {
  class OperatorSettlementError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    getOperatorStatement: jest.fn(),
    initiateOperatorSettlement: jest.fn(),
    OperatorSettlementError,
  };
});

import { db } from "@/src/db";
import { heldRoles } from "@/lib/launchRoles";
import { getPlan05Bool } from "@/lib/platformConfig";
import { isConfigured } from "@/lib/portpos";
import {
  getOperatorStatement,
  initiateOperatorSettlement,
  OperatorSettlementError,
} from "@/lib/operatorSettlement";
import { GET as shopDues, POST as shopPay } from "@/app/api/shop/dues+api";
import { GET as deliveryDues, POST as deliveryPay } from "@/app/api/delivery/dues+api";
import { GET as fleetDues, POST as fleetPay } from "@/app/api/fleet/dues+api";

const USER_ID = "11111111-1111-4111-a111-111111111111";
const OP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CASES = [
  { role: "shop", launch: "shop_owner", get: shopDues, post: shopPay },
  { role: "delivery", launch: "delivery_man", get: deliveryDues, post: deliveryPay },
  { role: "fleet", launch: "fleet_owner", get: fleetDues, post: fleetPay },
] as const;

function mockSelectQueue(rows: Record<string, unknown>[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const result = rows[i] ?? [];
    i++;
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => result,
    };
    return chain;
  });
}

function request(): Request {
  return { headers: { get: () => null } } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  (heldRoles as jest.Mock).mockResolvedValue([{ role: "shop_owner", status: "active" }]);
  (isConfigured as jest.Mock).mockReturnValue(true);
  (getPlan05Bool as jest.Mock).mockResolvedValue(true);
  (getOperatorStatement as jest.Mock).mockResolvedValue({
    operator_role: "shop",
    operator_id: OP_ID,
    state: "OWING",
    total_unpaid_paisa: 5_000,
    credit_headroom_paisa: 45_000,
  });
  (initiateOperatorSettlement as jest.Mock).mockResolvedValue({
    billId: "bill-1",
    paymentEventId: "evt-1",
    amountBdt: 5_000,
    payment_url: "https://gateway.example/inv-1",
    payment_event_id: "evt-1",
  });
  mockSelectQueue([[{ id: USER_ID, name: "Owner", email: "o@example.com", phone: "017" }], [{ id: OP_ID }]]);
});

describe("GET statement", () => {
  test.each(CASES)("$role returns the core statement as-is", async ({ launch, get }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "active" }]);
    const res = await get(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ state: "OWING", total_unpaid_paisa: 5_000 });
    expect(getOperatorStatement).toHaveBeenCalledWith(
      expect.any(String),
      OP_ID,
    );
  });

  test.each(CASES)("$role with an inactive role is 403 and never reads the statement", async ({ launch, get }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "suspended" }]);
    const res = await get(request());
    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("role_not_eligible");
    expect(getOperatorStatement).not.toHaveBeenCalled();
  });

  test("no operator entity for the account is 404", async () => {
    mockSelectQueue([[{ id: USER_ID, name: "Owner", email: "o@example.com", phone: "017" }], []]);
    const res = await shopDues(request());
    expect(res.status).toBe(404);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("operator_not_found");
  });
});

describe("POST settlement", () => {
  test.each(CASES)("$role starts a settlement for its own operator id", async ({ role, launch, post }) => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: launch, status: "active" }]);

    const res = await post(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      payment_url: "https://gateway.example/inv-1",
      payment_event_id: "evt-1",
      amount_bdt: 5_000,
      purpose: "subscription_settlement",
      bill_id: "bill-1",
    });
    expect(initiateOperatorSettlement).toHaveBeenCalledWith(
      expect.objectContaining({ operatorRole: role, operatorId: OP_ID, userId: USER_ID }),
    );
  });

  test("gateway not configured → 503 before any auth/read", async () => {
    (isConfigured as jest.Mock).mockReturnValue(false);
    const res = await shopPay(request());
    expect(res.status).toBe(503);
    expect(db.select).not.toHaveBeenCalled();
  });

  test("payments master switch off → 409 after identity", async () => {
    (getPlan05Bool as jest.Mock).mockResolvedValue(false);
    const res = await shopPay(request());
    expect(res.status).toBe(409);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("payments_not_enabled");
    expect(initiateOperatorSettlement).not.toHaveBeenCalled();
  });

  test("a typed no_open_bill maps to its status", async () => {
    (initiateOperatorSettlement as jest.Mock).mockRejectedValue(
      new OperatorSettlementError("no_open_bill", "No outstanding bill to settle", 400),
    );
    const res = await shopPay(request());
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("no_open_bill");
  });

  test("inactive role → 403 before the payments gate", async () => {
    (heldRoles as jest.Mock).mockResolvedValue([{ role: "shop_owner", status: "pending" }]);
    const res = await shopPay(request());
    expect(res.status).toBe(403);
    expect(getPlan05Bool).not.toHaveBeenCalled();
  });

  test("unauthenticated → 401", async () => {
    const errorsModule = jest.requireMock("@/lib/auth") as { verifySupabaseToken: jest.Mock };
    errorsModule.verifySupabaseToken.mockRejectedValueOnce(
      Object.assign(new Error("unauthorized"), { status: 401, statusCode: 401 }),
    );
    const res = await shopPay(request());
    expect(res.status).toBe(401);
  });
});
