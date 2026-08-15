/**
 * expireCredits regression (audit V-1): the earn row was never marked
 * processed, so the SAME expired cashback credit debited the rider wallet on
 * EVERY daily run, forever — unbounded recurring debit, phantom debt.
 *
 * The fix claims the earn row (nulls its expires_at) inside the same
 * transaction, so a second run finds nothing to debit. This test runs
 * expireCredits twice against the same fixture and asserts exactly ONE
 * cashback_expire audit row.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { transaction: jest.fn() },
}));

import { db } from "../../src/db";
import { riderWalletTransactions } from "../../src/db/schema";
import { expireCredits } from "../walletCashback";

type Row = Record<string, unknown>;

function buildDbMock(initialRwt: Row[]) {
  const state = { rwt: [...initialRwt] };
  const inserted: Row[] = [];

  const tx = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => {
          // Model the WHERE: unconsumed expired cashback_earn rows.
          const rows = () => {
            if (table !== riderWalletTransactions) return [];
            const now = new Date();
            return state.rwt.filter(
              (r) =>
                r.transaction_type === "cashback_earn" &&
                r.expires_at != null &&
                (r.expires_at as Date) <= now,
            );
          };
          return {
            for: jest.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(rows()),
            })),
          };
        }),
      })),
    })),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((_setVals: Row) => ({
        where: jest.fn(async () => {
          // The claim update: null out expires_at on unconsumed earn rows.
          if (table === riderWalletTransactions) {
            for (const r of state.rwt) {
              if (r.transaction_type === "cashback_earn" && r.expires_at != null) {
                r.expires_at = null;
              }
            }
          }
          return {};
        }),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(async (values: Row) => {
        inserted.push(values);
        return { returning: jest.fn(async () => [values]) };
      }),
    })),
  };

  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => unknown) => cb(tx),
  );

  return { inserted };
}

function expiredEarnRow(overrides: Row = {}): Row {
  return {
    id: "txn-1",
    rider_id: "rider-1",
    transaction_type: "cashback_earn",
    amount_bdt: 5000,
    expires_at: new Date(Date.now() - 1000),
    ...overrides,
  };
}

describe("expireCredits — exactly-once debit (V-1)", () => {
  test("an expired credit is debited exactly once across repeated runs", async () => {
    const { inserted } = buildDbMock([expiredEarnRow()]);

    await expireCredits();
    await expireCredits(); // ← the regression: the second run must find nothing

    const expireRows = inserted.filter(
      (r) => r.transaction_type === "cashback_expire",
    );
    expect(expireRows).toHaveLength(1);
    expect(expireRows[0]).toMatchObject({
      amount_bdt: -5000,
      reference_id: "txn-1",
    });
  });

  test("an unexpired credit is never debited", async () => {
    const { inserted } = buildDbMock([
      expiredEarnRow({ id: "txn-2", expires_at: new Date(Date.now() + 3600_000) }),
    ]);

    await expireCredits();

    expect(
      inserted.filter((r) => r.transaction_type === "cashback_expire"),
    ).toHaveLength(0);
  });
});
