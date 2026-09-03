// @ts-nocheck — Jest mock factories produce untyped DB/guard chains; runtime
// behavior is what's under test (Phase 3 precedent).
/**
 * Phase 6 — ambulance gates (§C.2) + §B.7 emergency interplay.
 *
 * - Ambulance-scheduled bid gate: fleet WITHOUT a verified cert pair → 403
 *   ambulance_certification_required; WITH pair → bid inserts.
 * - Pick-time cert-pair check: picked (driver, vehicle) must BE a verified
 *   pair matching the request's service_level.
 * - §B.7 carry-in: an ACTIVE emergency blocks rental pick AND delivery
 *   accept-bid; terminal (completed/cancelled/failed) does NOT block.
 */
import { jest } from "@jest/globals";
import { POST as bidsPOST } from "@/app/api/rental/bids+api";
import { POST as pickPOST } from "@/app/api/rental/assignments/[id]/pick+api";
import { POST as deliveryAcceptPOST } from "@/app/api/delivery/requests/[id]/accept-bid+api";

// ── Queue-based mock chains ──────────────────────────────────────────────
const mockSelectQueue: (() => unknown)[] = [];
const mockUpdateQueue: (() => unknown)[] = [];
const mockInsertCalls: { vals: Record<string, unknown> }[] = [];

// Stale entries must NEVER bleed across tests — clear every queue upfront.
beforeEach(() => {
  mockSelectQueue.length = 0;
  mockUpdateQueue.length = 0;
  mockInsertCalls.length = 0;
  mockFleetHasPair.mockReset();
  mockIsVerifiedPair.mockReset();
});

function mockThenableChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const pass = () => c;
  c.from = jest.fn(pass);
  c.where = jest.fn(pass);
  c.innerJoin = jest.fn(pass);
  c.limit = jest.fn(pass);
  c.for = jest.fn(pass);
  c.orderBy = jest.fn(pass);
  c.set = jest.fn(() => c);
  c.values = jest.fn((v: Record<string, unknown>) => {
    mockInsertCalls.push({ vals: v });
    return c;
  });
  c.returning = jest.fn(() => Promise.resolve(rows));
  c.then = (res?: (v: unknown[]) => unknown, rej?: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  c.catch = (rej: (e: unknown) => void) => Promise.resolve(rows).catch(rej);
  return c;
}

function mockQueueSelect(rows: unknown[]) {
  mockSelectQueue.push(() => mockThenableChain(rows));
}
function mockQueueUpdate(rows: unknown[]) {
  mockUpdateQueue.push(() => mockThenableChain(rows));
}

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(() => {
      const next = mockSelectQueue.shift();
      return next ? next() : mockThenableChain([]);
    }),
    update: jest.fn(() => {
      const next = mockUpdateQueue.shift();
      return next ? next() : mockThenableChain([]);
    }),
    insert: jest.fn(() => mockThenableChain([{ id: "inserted-1" }])),
    transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: jest.fn(() => {
          const next = mockSelectQueue.shift();
          return next ? next() : mockThenableChain([]);
        }),
        update: jest.fn(() => {
          const next = mockUpdateQueue.shift();
          return next ? next() : mockThenableChain([]);
        }),
        insert: jest.fn(() => mockThenableChain([{ id: "tx-inserted-1" }])),
      };
      return fn(tx);
    }),
  },
}));

// ambulanceCerts is mocked HERE (gates file) — the core chain file tests the
// real implementation.
const mockFleetHasPair = jest.fn();
const mockIsVerifiedPair = jest.fn();
jest.mock("@/lib/ambulanceCerts", () => ({
  fleetHasVerifiedCertPair: (...a: unknown[]) => mockFleetHasPair(...a),
  isVerifiedCertPair: (...a: unknown[]) => mockIsVerifiedPair(...a),
  serviceLevelSatisfies: (cert: string | null | undefined, required: string) =>
    (cert === "ALS" || cert === "BLS") && (cert === "ALS" || required === "BLS"),
  getVerifiedCertForUser: jest.fn(),
  getEligibleEmergencyDriverUserIds: jest.fn(async () => []),
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireFleetMarketplaceAccess:
    () =>
    async () => ({
      supabaseUser: { id: "auth-1" },
      dbUser: { id: "db-user-1", role: "driver" },
      memberships: [{ fleet_id: "fleet-1", role: "OWNER" }],
    }),
  requireAmbulanceCertified:
    () =>
    async () => ({
      supabaseUser: { id: "auth-1" },
      dbUser: { id: "db-user-1", role: "driver" },
      driver: { id: "d1", fleet_id: "fleet-1" },
      cert: { id: "cert-1", service_level: "ALS" },
    }),
}));

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-1" })),
  requireFleetMember:
    () =>
    async () => ({
      supabaseUser: { id: "auth-1" },
      dbUser: { id: "db-user-1", role: "driver" },
      membership: { fleet_id: "fleet-1", role: "OWNER" },
    }),
}));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: "auth-1" } } })) },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: { id: "db-user-1" }, error: null })),
    })),
  },
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: jest.fn(async () => true),
  getConfigInt: jest.fn(async (_key: string, fallback: number) => fallback),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const future = new Date(Date.now() + 3600_000).toISOString();

// ── §H.6: ambulance-scheduled bid gate ───────────────────────────────────

describe("Phase 6 — ambulance-scheduled bid gate (§C.2a)", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockInsertCalls.length = 0;
    mockFleetHasPair.mockReset();
  });

  const bidBody = {
    request_id: "11111111-1111-4111-8111-111111111111",
    vehicle_type: "ambulance_basic",
    quoted_price_bdt: 200000,
  };

  it("403 ambulance_certification_required when the fleet has no verified pair", async () => {
    mockFleetHasPair.mockResolvedValue(false);
    mockQueueSelect([
      {
        id: bidBody.request_id,
        category: "ambulance_scheduled",
        service_level: "ALS",
        status: "broadcasting",
        soft_deadline_at: future,
        tracking_required: false,
      },
    ]);

    const res = await bidsPOST(
      new Request("http://localhost/api/rental/bids", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(bidBody),
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ambulance_certification_required");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("inserts the bid when the fleet holds a matching verified pair", async () => {
    mockFleetHasPair.mockResolvedValue(true);
    const requestRow = {
      id: bidBody.request_id,
      category: "ambulance_scheduled",
      service_level: "ALS",
      status: "broadcasting",
      soft_deadline_at: future,
      tracking_required: false,
    };
    // Select order (N12 submit tx): pre-check request → open-bid cap →
    // in-tx FOR UPDATE re-lock of the request
    mockQueueSelect([requestRow]);
    mockQueueSelect([{ cnt: 0 }]);
    mockQueueSelect([requestRow]);

    const res = await bidsPOST(
      new Request("http://localhost/api/rental/bids", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(bidBody),
      }),
    );

    expect(res.status).toBe(201);
    expect(mockFleetHasPair).toHaveBeenCalledWith("fleet-1", "ALS");
  });
});

// ── §H.6: pick-time cert-pair check + §B.7 emergency interplay ───────────

describe("Phase 6 — pick-time cert pair + §B.7 emergency block", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockInsertCalls.length = 0;
    mockIsVerifiedPair.mockReset();
  });

  const ASGN_ID = "44444444-4444-4444-8444-444444444441"; // B7: route ids must be UUIDs

  const pickBody = {
    driver_user_id: "22222222-2222-4222-8222-222222222222",
    vehicle_id: "33333333-3333-4333-8333-333333333333",
  };

  function queueHappyPathAssignment() {
    // ONE queue entry PER select statement (in handler execution order)
    mockQueueSelect([
      {
        id: ASGN_ID,
        request_id: "44444444-4444-4444-8444-444444444444",
        fleet_id: "fleet-1",
        released_at: null,
        assigned_driver_user_id: null,
      },
    ]);
    mockQueueSelect([
      { id: "d1", user_id: pickBody.driver_user_id, fleet_id: "fleet-1", status: "active" },
    ]);
    mockQueueSelect([{ id: pickBody.vehicle_id, fleet_id: "fleet-1" }]);
    mockQueueSelect([{ category: "ambulance_scheduled", service_level: "ALS" }]); // parent request
  }

  it("403 when the picked (driver, vehicle) is not a verified pair for the level", async () => {
    queueHappyPathAssignment();
    mockIsVerifiedPair.mockResolvedValue(false);

    const res = await pickPOST(
      new Request("http://localhost/pick", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(pickBody),
      }),
      { id: ASGN_ID },
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ambulance_certification_required");
    expect(mockIsVerifiedPair).toHaveBeenCalledWith(
      pickBody.driver_user_id,
      pickBody.vehicle_id,
      "ALS",
    );
  });

  it("409 driver_already_committed when the driver holds an ACTIVE emergency", async () => {
    queueHappyPathAssignment();
    mockIsVerifiedPair.mockResolvedValue(true);
    // §B.7 selects (now inside tx): locked-driver, active rental, active delivery, ACTIVE EMERGENCY
    mockQueueSelect([{ id: "d1", user_id: pickBody.driver_user_id, fleet_id: "fleet-1", status: "active" }]); // lockedDriver
    mockQueueSelect([]); // active rental — none
    mockQueueSelect([]); // active delivery — none
    mockQueueSelect([{ id: "e9" }]); // ACTIVE EMERGENCY

    const res = await pickPOST(
      new Request("http://localhost/pick", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(pickBody),
      }),
      { id: ASGN_ID },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("driver_already_committed");
  });

  it("terminal emergency (completed/cancelled/failed) does NOT block the pick", async () => {
    queueHappyPathAssignment();
    mockIsVerifiedPair.mockResolvedValue(true);
    // §B.7 selects (now inside tx): locked-driver, active rental, active delivery, emergency
    mockQueueSelect([{ id: "d1", user_id: pickBody.driver_user_id, fleet_id: "fleet-1", status: "active" }]); // lockedDriver
    mockQueueSelect([]); // rental — none
    mockQueueSelect([]); // delivery — none
    mockQueueSelect([]); // emergency — none active
    mockQueueUpdate([{ id: ASGN_ID }]); // assignment update
    mockQueueUpdate([{ id: "req-1" }]); // rental_requests confirmation update

    const res = await pickPOST(
      new Request("http://localhost/pick", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(pickBody),
      }),
      { id: ASGN_ID },
    );

    expect(res.status).toBe(200);
  });
});

// ── §H.6: §B.7 emergency interplay — delivery accept-bid ─────────────────

describe("Phase 6 — §B.7 emergency block on delivery accept-bid", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockUpdateQueue.length = 0;
  });

  const UUID = {
    dr: "55555555-5555-4555-8555-555555555555",
    bid: "66666666-6666-4666-8666-666666666666",
  };

  function deliveryQueue(requestStatus: string) {
    return [
      () =>
        mockQueueSelect([
          {
            id: UUID.dr,
            created_by_user_id: "db-user-1",
            status: requestStatus,
            source_shop_order_id: null,
          },
        ]),
      () =>
        mockQueueSelect([
          {
            id: UUID.bid,
            request_id: UUID.dr,
            status: "active",
            courier_user_id: "db-user-1",
            quoted_fee_bdt: 50000,
          },
        ]),
    ];
  }

  it("409 driver_already_committed when the parcel courier holds an ACTIVE emergency", async () => {
    deliveryQueue("pending").forEach((q) => q());
    mockQueueSelect([{ courier_type: "parcel" }]); // courier
    mockQueueSelect([{ id: "drv-1" }]); // drivers-row FOR UPDATE
    mockQueueSelect([]); // active rental — none
    mockQueueSelect([{ id: "e9" }]); // ACTIVE EMERGENCY — blocks

    const res = await deliveryAcceptPOST(
      new Request(`http://localhost/api/delivery/requests/${UUID.dr}/accept-bid`, {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ bid_id: UUID.bid }),
      }),
      { id: UUID.dr },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("driver_already_committed");
  });

  it("proceeds when the emergency is terminal (no active row returned)", async () => {
    deliveryQueue("pending").forEach((q) => q());
    mockQueueSelect([{ courier_type: "parcel" }]);
    mockQueueSelect([{ id: "drv-1" }]);
    mockQueueSelect([]); // rental — none
    mockQueueSelect([]); // emergency — none active (terminal rows excluded by the NOT IN filter)
    mockQueueSelect([]); // active delivery leg — none
    mockQueueUpdate([{ id: UUID.dr, status: "assigned" }]); // request accept (conditional)
    mockQueueUpdate([{ id: UUID.bid }]); // winning bid
    mockQueueUpdate([]); // losing bids
    // leg creation uses tx.insert (mocked returning) — no further selects

    const res = await deliveryAcceptPOST(
      new Request(`http://localhost/api/delivery/requests/${UUID.dr}/accept-bid`, {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ bid_id: UUID.bid }),
      }),
      { id: UUID.dr },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.delivery.status).toBe("assigned");
  });
});
