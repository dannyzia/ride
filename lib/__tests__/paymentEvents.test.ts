/**
 * payment_events invariants (AGENTS.md Payment invariants):
 *  - same idempotency key → exactly one payment_events row (a collision
 *    returns null instead of creating a second invoice)
 *  - the row flips to callback_pending with the provider txn id after the
 *    PortPos invoice is created
 *  - invoice failure rolls the transaction back (no orphaned 'initiated' row)
 *
 * The DB and the PortPos client are mocked.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { transaction: jest.fn() },
}));
jest.mock("../portpos", () => ({
  portposClient: { createInvoice: jest.fn() },
}));

import { db } from "../../src/db";
import { portposClient } from "../portpos";
import {
  initiatePortposPayment,
  PortposPaymentInitiation,
} from "../paymentEvents";

const params: PortposPaymentInitiation = {
  user_id: "user-1",
  idempotency_key: "11111111-1111-4111-8111-111111111111",
  amount_bdt: 50000,
  purpose: "driver_package",
  package_name: "Starter 50",
  customer_name: "Rider One",
  customer_email: "rider@example.com",
  customer_phone: "+8801711111111",
  redirect_url: "https://app.example/redirect",
  ipn_url: "https://app.example/api/payment/portpos/callback",
};

function buildDbMock(insertReturn: { id: string }[]) {
  const updates: Record<string, unknown>[] = [];
  const tx = {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(async () => insertReturn),
        })),
        returning: jest.fn(async () => insertReturn),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn((setVals: Record<string, unknown>) => {
        updates.push(setVals);
        return { where: jest.fn(async () => ({})) };
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => unknown) => cb(tx),
  );
  return { tx, updates };
}

describe("initiatePortposPayment — idempotency", () => {
  beforeEach(() => jest.clearAllMocks());

  test("idempotency-key collision returns null and never creates a second invoice", async () => {
    buildDbMock([]); // onConflictDoNothing returns no row
    (portposClient.createInvoice as jest.Mock).mockResolvedValue({
      invoice_id: "inv-1",
      payment_url: "https://pay.example/1",
    });

    const result = await initiatePortposPayment(params, {
      onConflictDoNothing: true,
    });

    expect(result).toBeNull();
    expect(portposClient.createInvoice).not.toHaveBeenCalled();
  });

  test("initiates the payment and flips the row to callback_pending", async () => {
    const { updates } = buildDbMock([{ id: "evt-1" }]);
    (portposClient.createInvoice as jest.Mock).mockResolvedValue({
      invoice_id: "inv-1",
      payment_url: "https://pay.example/1",
    });

    const result = await initiatePortposPayment(params);

    expect(result).toEqual({
      payment_url: "https://pay.example/1",
      payment_event_id: "evt-1",
    });
    expect(portposClient.createInvoice).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({
      provider_txn_id: "inv-1",
      status: "callback_pending",
    });
  });

  test("invoice creation failure rolls back — no status flip, call rejects", async () => {
    const { updates } = buildDbMock([{ id: "evt-1" }]);
    (portposClient.createInvoice as jest.Mock).mockRejectedValue(
      new Error("portpos down"),
    );

    await expect(initiatePortposPayment(params)).rejects.toThrow("portpos down");
    expect(updates).toHaveLength(0);
  });
});
