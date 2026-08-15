/**
 * PortPos callback handler invariants (AGENTS.md Payment invariants) tested at
 * the HTTP level against POST /api/payment/portpos/callback:
 *  - duplicate callback activates the subscription exactly once (the second
 *    request short-circuits on status='paid' before activateSubscription is
 *    ever reached)
 *  - failed activation enqueues a compensation_queue row (status 'pending'),
 *    which the 30s compensation worker drains (the "within 30 seconds" SLA)
 *
 * The DB, PortPos client, activateSubscription, and accounting are mocked;
 * parseJsonBody (real) is driven by a fake Request whose json() returns the
 * IPN body.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../portpos", () => ({
  portposClient: { verifyIPN: jest.fn(), getInvoice: jest.fn() },
  isConfigured: jest.fn(),
}));
jest.mock("../activateSubscription", () => ({
  activateSubscription: jest.fn(),
}));
jest.mock("../accounting", () => ({
  recordSubscriptionSale: jest.fn(),
  recordWalletTopup: jest.fn(),
  recordRiderPassPurchase: jest.fn(),
}));

import { db } from "../../src/db";
import {
  paymentEvents,
  compensationQueue,
  drivers,
  riderPasses,
  riderSubscriptions,
  users,
  driverWalletTransactions,
  riderWalletTransactions,
} from "../../src/db/schema";
import { portposClient, isConfigured } from "../portpos";
import { activateSubscription } from "../activateSubscription";
import { POST } from "../../app/api/payment/portpos/callback+api";

type Row = Record<string, unknown>;

const INVOICE_ID = "inv-1";

function baseEvent(overrides: Row = {}): Row {
  return {
    id: "evt-1",
    provider_txn_id: INVOICE_ID,
    amount_bdt: 50000, // 500.00 taka in paisa
    status: "initiated",
    purpose: "driver_package",
    user_id: "user-1",
    driver_id: "driver-1",
    pass_id: null,
    ride_id: null,
    subscription_id: null,
    ...overrides,
  };
}

function buildDbMock(initialRows: Row[]) {
  const state: { paymentEvents: Row[]; compensationQueue: Row[] } = {
    paymentEvents: [...initialRows],
    compensationQueue: [],
  };

  const rowsFor = (table: unknown): Row[] => {
    if (table === paymentEvents) return state.paymentEvents;
    if (table === compensationQueue) return state.compensationQueue;
    // Branches not exercised by these tests (wallet topup, rider pass) return
    // empty so their code paths are skipped or short-circuit harmlessly.
    if (
      table === drivers ||
      table === riderPasses ||
      table === riderSubscriptions ||
      table === users ||
      table === driverWalletTransactions ||
      table === riderWalletTransactions
    ) {
      return [];
    }
    return [];
  };

  const whereChain = (table: unknown) => {
    const rows = () => rowsFor(table);
    return {
      for: jest.fn(() => ({
        limit: jest.fn(async (n: number) => rows().slice(0, n)),
      })),
      limit: jest.fn(async (n: number) => rows().slice(0, n)),
    };
  };

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => ({ where: jest.fn(() => whereChain(table)) })),
  }));

  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn(async (values: Row) => {
      if (table === compensationQueue) state.compensationQueue.push(values);
      return { onConflictDoNothing: jest.fn(), returning: jest.fn() };
    }),
  }));

  const tx = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({ where: jest.fn(() => whereChain(table)) })),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn(async (values: Row) => {
        if (table === compensationQueue) state.compensationQueue.push(values);
        return { returning: jest.fn(async () => [values]) };
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn((setVals: Row) => ({
        where: jest.fn(async () => {
          const row = state.paymentEvents[0];
          if (row) Object.assign(row, setVals);
          return {};
        }),
      })),
    })),
  };

  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => unknown) => cb(tx),
  );

  return { state, tx };
}

function ipnRequest(): Request {
  return {
    json: async () => ({ invoice: INVOICE_ID }),
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  (isConfigured as jest.Mock).mockReturnValue(true);
  (portposClient.verifyIPN as jest.Mock).mockResolvedValue(true);
  (portposClient.getInvoice as jest.Mock).mockResolvedValue({
    invoice_id: INVOICE_ID,
    order: { amount: "500.00", currency: "BDT", status: "ACCEPTED" },
    reference: "ref-1",
  });
});

describe("POST /api/payment/portpos/callback — duplicate callback", () => {
  test("activates the subscription exactly once across two callbacks", async () => {
    const { state } = buildDbMock([baseEvent()]);
    (activateSubscription as jest.Mock).mockImplementation(
      async (id: string) => {
        // Mirror the real side effect: the payment_event flips to paid and
        // links the subscription, so the second callback sees a paid row.
        const row = state.paymentEvents.find((r) => r.id === id);
        if (row) {
          row.status = "paid";
          row.subscription_id = "sub-9";
        }
        return { subscriptionId: "sub-9" };
      },
    );

    const first = await POST(ipnRequest());
    expect(await first.json()).toEqual({ result: "success" });

    const second = await POST(ipnRequest());
    expect(await second.json()).toEqual({ result: "success" });

    // Duplicate callback must NOT re-activate.
    expect(activateSubscription).toHaveBeenCalledTimes(1);
    // Every request is still verified against PortPos (no forged bypass).
    expect(portposClient.verifyIPN).toHaveBeenCalledTimes(2);
    expect(portposClient.verifyIPN).toHaveBeenCalledWith(INVOICE_ID, "500.00");
  });
});

describe("POST /api/payment/portpos/callback — failed activation compensation", () => {
  test("activation failure enqueues a pending compensation row and returns error", async () => {
    const { state } = buildDbMock([baseEvent()]);
    (activateSubscription as jest.Mock).mockRejectedValue(
      new Error("activation failed"),
    );

    const res = await POST(ipnRequest());
    expect(await res.json()).toEqual({ result: "error" });

    expect(state.compensationQueue).toHaveLength(1);
    expect(state.compensationQueue[0]).toMatchObject({
      payment_event_id: "evt-1",
      status: "pending",
      attempt_count: 0,
    });
    // next_retry_at is set to now, so the 30s compensation worker picks the
    // row up on its next tick (the "within 30 seconds" SLA).
    expect(state.compensationQueue[0].next_retry_at).toBeInstanceOf(Date);
  });
});
