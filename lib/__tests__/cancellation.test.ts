/**
 * Cancellation-fee tier semantics (audit Y-1), pinned as a table-driven test.
 *
 * The DB is mocked and the ride is passed as a snapshot (skipping the ride
 * SELECT). Policies are keyed by table identity so ordering in the mock is
 * irrelevant — the function's own DESC threshold sort decides tier selection.
 *
 * Covered semantics (now documented in lib/cancellation.ts):
 *  - within the grace period (below the smallest threshold) → 0 fee
 *  - past only the first tier → the first tier's fee
 *  - past multiple tiers → the LARGEST qualifying threshold's fee (escalating:
 *    the longer the driver waited, the higher the tier). This is the
 *    regression assertion — ascending first-match would charge the smallest
 *    qualifying tier and make the steeper tiers unreachable.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn() },
}));

import { db } from "../../src/db";
import { cancellationPolicies } from "../../src/db/schema";
import { evaluateCancellation } from "../cancellation";

const BY_TABLE = new Map<unknown, Record<string, unknown>[]>();

beforeEach(() => {
  BY_TABLE.clear();
  jest.clearAllMocks();

  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => {
      const rows = () => BY_TABLE.get(table) ?? [];
      return {
        where: jest.fn(() => ({
          // Faithfully mirror the query's DESC threshold sort (the real sort
          // happens in SQL; the mock applies it so the loop's first-match
          // semantics are exercised against correctly-ordered input).
          orderBy: jest.fn(async () =>
            [...rows()].sort(
              (a, b) =>
                Number(b.time_threshold_seconds) -
                Number(a.time_threshold_seconds),
            ),
          ),
        })),
      };
    }),
  }));
});

const TIER_60: Record<string, unknown> = {
  name: "tier_60s",
  time_threshold_seconds: 60,
  fee_amount_bdt: 50,
  fee_type: "flat",
  max_fee_bdt: 10000,
  priority: 1,
  is_active: true,
  canceller_role: "rider",
  ride_status: "matched",
};

const TIER_300: Record<string, unknown> = {
  ...TIER_60,
  name: "tier_300s",
  time_threshold_seconds: 300,
  fee_amount_bdt: 100,
};

function cancelAt(elapsedSec: number) {
  return evaluateCancellation(
    {
      status: "matched",
      created_at: new Date(Date.now() - elapsedSec * 1000),
    },
    "rider",
  );
}

describe("evaluateCancellation — escalating tier selection", () => {
  test.each([
    [30, 0, "within_grace_period"],
    [90, 50, "cancellation_rider_tier_60s"],
    [400, 100, "cancellation_rider_tier_300s"], // largest qualifying tier wins
  ])("elapsed=%ss → fee %s paisa", async (elapsedSec, expectedFee, expectedReason) => {
    BY_TABLE.set(cancellationPolicies, [TIER_60, TIER_300]);

    const result = await cancelAt(elapsedSec as number);
    expect(result.feeBdt).toBe(expectedFee);
    expect(result.reason).toBe(expectedReason);
  });

  test("a lone tier below the elapsed time is charged", async () => {
    BY_TABLE.set(cancellationPolicies, [TIER_60]);

    const result = await cancelAt(120);
    expect(result.feeBdt).toBe(50);
  });

  test("no policies for the role/status → within_grace_period (no fee)", async () => {
    BY_TABLE.set(cancellationPolicies, []);

    const result = await cancelAt(400);
    expect(result.feeBdt).toBe(0);
    expect(result.reason).toBe("within_grace_period");
  });
});
