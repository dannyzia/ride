/**
 * U-1 regression: no-show must claim the ride status atomically.
 *
 * The bug: no-show read the ride, checked the status in JS, then ran an
 * UNGUARDED update to 'cancelled'. If the rider cancelled first (fee assessed,
 * compensation credited), the driver's no-show landed a beat later, overwrote
 * cancelled_by/cancel_reason, re-stamped a different cancellation fee, and ran
 * its own compensation + riderFeeDeductions inserts — rider owed the fee twice,
 * driver compensated twice. cancel+api.ts already did the atomic claim; no-show
 * now mirrors it. These tests pin the two interleavings.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
}));
jest.mock("../auth", () => ({
  requireRole: jest.fn(),
}));
jest.mock("../cancellation", () => ({
  evaluateCancellation: jest.fn(),
}));
jest.mock("../cancellationCompensation", () => ({
  createCancellationCredit: jest.fn(),
}));

import { db } from "../../src/db";
import { rides, drivers, riderFeeDeductions } from "../../src/db/schema";
import { requireRole } from "../auth";
import { evaluateCancellation } from "../cancellation";
import { createCancellationCredit } from "../cancellationCompensation";
import { POST } from "../../app/api/ride/[id]/no-show+api";

type Row = Record<string, unknown>;

const RIDE = {
  id: "11111111-1111-4111-8111-111111111111",
  driver_id: "driver-1",
  user_id: "user-1",
  status: "matched",
  created_at: new Date("2026-08-15T10:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockReturnValue(
    jest.fn(async () => ({ dbUser: { id: "driver-1", role: "driver" } })),
  );
  (evaluateCancellation as jest.Mock).mockResolvedValue({ feeBdt: 5000, reason: "cancellation_rider_policy" });
  (createCancellationCredit as jest.Mock).mockResolvedValue(undefined);

  // Ride snapshot read (pre-claim).
  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((table: unknown) => ({
      where: jest.fn(() => ({ limit: jest.fn(async () => (table === rides ? [RIDE] : [])) })),
    })),
  }));
});

/** Claim update returns `claimRows`; inserts are recorded. */
function installUpdateMock(claimRows: Row[]) {
  const inserted: Row[] = [];
  (db.update as jest.Mock).mockImplementation(() => ({
    set: jest.fn(() => ({
      // `.where()` must return the chain synchronously (the route chains
      // `.returning()` onto it); only `.returning()` is async.
      where: jest.fn(() => ({ returning: jest.fn(async () => claimRows) })),
    })),
  }));
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn(async (values: Row) => {
      if (table === riderFeeDeductions) inserted.push(values);
      return { returning: jest.fn(async () => []) };
    }),
  }));
  return inserted;
}

describe("POST /api/ride/[id]/no-show — cancel/no-show interleaving", () => {
  test("claim lost (rider cancelled first): 409, no fee, no credit, no deduction", async () => {
    // Rider's cancel won the status transition first → the driver's claim
    // matches zero rows.
    installUpdateMock([]);

    const res = await POST({} as Request, { id: RIDE.id });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "invalid_status",
      message: `Cannot mark no-show in status: ${RIDE.status}`,
    });

    // The loser must write nothing: no fee evaluation (skipped before the
    // claim), no compensation credit, no rider fee deduction.
    expect(evaluateCancellation).not.toHaveBeenCalled();
    expect(createCancellationCredit).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("claim won: fee evaluated against the PRE-cancel snapshot, credit + deduction exactly once", async () => {
    installUpdateMock([{ id: RIDE.id }]);

    const res = await POST({} as Request, { id: RIDE.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, fee_bdt: 5000 });

    // Fee must be computed from the snapshot captured BEFORE the claim, not a
    // re-read (a re-read would see status='cancelled' and match no policy).
    expect(evaluateCancellation).toHaveBeenCalledWith(
      { status: "matched", created_at: RIDE.created_at },
      "rider",
    );

    expect(createCancellationCredit).toHaveBeenCalledTimes(1);
    expect(createCancellationCredit).toHaveBeenCalledWith({
      originalDriverId: "driver-1",
      cancellationRideId: RIDE.id,
      amountBdt: 5000,
    });

    // Driver is freed back into the pool (mirrors cancel's restore).
    expect(db.update).toHaveBeenCalledWith(drivers);
  });
});
