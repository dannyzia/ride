// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime
// behavior is what's under test (Phase 5 precedent).
/**
 * N13 — delivery accept-bid F37 serialization.
 *
 * Food couriers previously locked ONLY the users row; rental pick and
 * emergency accept lock the drivers row — a dual-role (food courier + driver)
 * user could race two different-vertical accepts past the check-then-insert
 * because the two paths serialized on DIFFERENT rows.
 *
 * Fix under test: the food branch now also takes drivers-row FOR UPDATE
 * (the F37 common serialization point) while keeping the users-row lock for
 * food-vs-food races.
 */
import { POST as acceptDeliveryBid } from "@/app/api/delivery/requests/[id]/accept-bid+api";

const DREQ = "00000000-0000-4000-8000-0000000000d1";
const BID = "00000000-0000-4000-8000-0000000000b1";
const USER = "00000000-0000-4000-8000-0000000000u1";
const COURIER = "00000000-0000-4000-8000-0000000000c1";

let mockDeliveryReqRows: Record<string, unknown>[] = [];
let mockBidRows: Record<string, unknown>[] = [];
let mockCourierRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockUserRows: Record<string, unknown>[] = [];
// R3 round-2 (finding 5): §B.7 fixtures for the food-hero branch
let mockEmergencyRows: Record<string, unknown>[] = [];
let mockRentalRows: Record<string, unknown>[] = [];
let mockAssignmentRows: Record<string, unknown>[] = [];
const mockForTags: string[] = [];

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    deliveryReq: schema.deliveryRequests,
    bids: schema.deliveryBids,
    legs: schema.deliveryLegs,
    couriers: schema.couriers,
    drivers: schema.drivers,
    users: schema.users,
    assignments: schema.awardedBidAssignments,
    rental: schema.rentalRequests,
    emergency: schema.emergencyRequests,
    certs: schema.ambulanceCertifications,
  };
  const tagOf = (t: unknown) =>
    t === T.deliveryReq ? "delivery_requests"
    : t === T.bids ? "delivery_bids"
    : t === T.legs ? "delivery_legs"
    : t === T.couriers ? "couriers"
    : t === T.drivers ? "drivers"
    : t === T.users ? "users"
    : t === T.assignments ? "awarded_bid_assignments"
    : t === T.rental ? "rental_requests"
    : t === T.emergency ? "emergency_requests"
    : t === T.certs ? "ambulance_certifications"
    : "other";

  const chainable = (rows: unknown[], tag: string) => {
    const c: any = () => {};
    c.limit = async () => rows;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = async () => {
      // Postgres semantics: FOR UPDATE on zero rows acquires no lock
      if (rows.length > 0) mockForTags.push(tag);
      return rows;
    };
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const resolveRows = (t: unknown) => {
    if (t === T.deliveryReq) return mockDeliveryReqRows;
    if (t === T.bids) return mockBidRows;
    if (t === T.couriers) return mockCourierRows;
    if (t === T.drivers) return mockDriverRows;
    if (t === T.users) return mockUserRows;
    if (t === T.emergency) return mockEmergencyRows;
    if (t === T.rental) return mockRentalRows;
    if (t === T.assignments) return mockAssignmentRows;
    return [];
  };

  const fromQ = (t: unknown) => {
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = () => chainable(resolveRows(t), tagOf(t));
    return q;
  };

  const makeSelect = () => (..._sargs: unknown[]) => ({ from: (t: unknown) => fromQ(t) });

  const makeTx = () => ({
    select: makeSelect(),
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [{ id: "updated-1" }] }),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "inserted-1" }] }),
    }),
  });

  return {
    db: {
      select: makeSelect(),
      insert: () => ({
        values: () => ({ returning: async () => [{ id: "inserted-1" }] }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [{ id: "updated-1" }] }),
        }),
      }),
      transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: async () => ({ id: "sb-user-1" }),
}));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: USER } }),
        }),
      }),
    }),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeAccept() {
  return new Request(`http://localhost/api/delivery/requests/${DREQ}/accept-bid`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bid_id: BID }),
  });
}

describe("N13 — delivery accept-bid F37 common lock", () => {
  beforeEach(() => {
    mockDeliveryReqRows = [
      { id: DREQ, created_by_user_id: USER, status: "pending" },
    ];
    mockBidRows = [
      {
        id: BID,
        request_id: DREQ,
        status: "active",
        courier_user_id: COURIER,
        quoted_fee_bdt: 5000,
      },
    ];
    mockDriverRows = [];
    mockUserRows = [{ id: COURIER }]; // the locked users row exists
    mockEmergencyRows = [];
    mockRentalRows = [];
    mockAssignmentRows = [];
    mockForTags.length = 0;
  });

  it("food courier WITH a drivers row locks BOTH users and drivers rows", async () => {
    mockCourierRows = [{ user_id: COURIER, courier_type: "food", status: "active" }];
    mockDriverRows = [{ id: "driver-row-1" }]; // dual-role user
    const res = await acceptDeliveryBid(makeAccept(), { id: DREQ });
    expect(res.status).toBe(200);
    expect(mockForTags).toContain("users");
    expect(mockForTags).toContain("drivers");
  });

  it("food courier WITHOUT a drivers row still locks users (food-vs-food)", async () => {
    mockCourierRows = [{ user_id: COURIER, courier_type: "food", status: "active" }];
    const res = await acceptDeliveryBid(makeAccept(), { id: DREQ });
    expect(res.status).toBe(200);
    expect(mockForTags).toContain("users");
    expect(mockForTags).not.toContain("drivers");
  });

  it("parcel courier locks drivers (F37, unchanged regression guard)", async () => {
    mockCourierRows = [{ user_id: COURIER, courier_type: "parcel", status: "active" }];
    mockDriverRows = [{ id: "driver-row-1" }];
    const res = await acceptDeliveryBid(makeAccept(), { id: DREQ });
    expect(res.status).toBe(200);
    expect(mockForTags).toContain("drivers");
  });

  // ── R3 round-2 (finding 5): food-hero branch runs §B.7 under its locks ──

  it("finding 5: dual-role food hero with an ACTIVE emergency → 409 driver_already_committed", async () => {
    mockCourierRows = [{ user_id: COURIER, courier_type: "food", status: "active" }];
    mockDriverRows = [{ id: "driver-row-1" }];
    mockEmergencyRows = [{ id: "emg-1" }]; // non-terminal emergency commitment

    const res = await acceptDeliveryBid(makeAccept(), { id: DREQ });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("driver_already_committed");
  });

  it("finding 5: dual-role food hero with an active rental assignment → 409", async () => {
    mockCourierRows = [{ user_id: COURIER, courier_type: "food", status: "active" }];
    mockDriverRows = [{ id: "driver-row-1" }];
    // §B.7 FROM table is awardedBidAssignments (the parent-status join filter
    // is exercised in SQL; the mock drives row presence)
    mockAssignmentRows = [
      { id: "assign-1", assigned_driver_user_id: COURIER, released_at: null },
    ];

    const res = await acceptDeliveryBid(makeAccept(), { id: DREQ });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("driver_already_committed");
  });

  it("finding 5: dual-role food hero with NO rental/emergency commits (regression guard)", async () => {
    mockCourierRows = [{ user_id: COURIER, courier_type: "food", status: "active" }];
    mockDriverRows = [{ id: "driver-row-1" }];

    const res = await acceptDeliveryBid(makeAccept(), { id: DREQ });
    expect(res.status).toBe(200);
  });
});
