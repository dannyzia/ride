// @ts-nocheck — Jest mock factories produce untyped DB/socket chains; runtime
// behavior is what's under test (Phase 3 precedent).
/**
 * Phase 6 — Ambulance core (§H.6): TTL sweep, cert renewal (F12),
 * service_level cross-field, broadcast eligibility, §B.5 transitions,
 * first-accept-wins race.
 *
 * Real modules under test: emergencyChain, ambulanceCerts, renewal route,
 * rental create route (cross-field). Mocked: DB (queue chains), WS index
 * (sendToUser — avoids booting the server), notify, platformConfig.
 */
import { jest } from "@jest/globals";
import {
  sweepExpiredEmergencies,
  acceptEmergencyRequest,
  transitionEmergencyRequest,
  cancelEmergencyRequest,
} from "@/utils-server/emergencyChain";
import { getEligibleEmergencyDriverUserIds } from "@/lib/ambulanceCerts";
import { PATCH as renewPATCH } from "@/app/api/ambulance/certifications/[id]/renew+api";
import { POST as rentalRequestsPOST } from "@/app/api/rental/requests+api";

// h3 geometry is mocked (real h3-js does not load under the jest-expo env)
const mockGetH3Cell = jest.fn((lat: number, lng: number) => `cell-${lat.toFixed(3)}-${lng.toFixed(3)}`);
const mockGetH3Ring = jest.fn((lat: number, lng: number, _k: number) => [
  mockGetH3Cell(lat, lng),
  "ring-cell-1",
]);
jest.mock("@/lib/h3", () => ({
  getH3Cell: (...a: unknown[]) => mockGetH3Cell(...(a as [number, number])),
  getH3Ring: (...a: unknown[]) => mockGetH3Ring(...(a as [number, number, number])),
}));

// ── Queue-based mock chains (cross-fleet.test.ts pattern) ────────────────
const mockSelectQueue: (() => unknown)[] = [];
const mockUpdateQueue: (() => unknown)[] = [];
const mockSetCaptures: Record<string, unknown>[] = [];

// Stale entries must NEVER bleed across tests — clear every queue upfront.
beforeEach(() => {
  mockSelectQueue.length = 0;
  mockUpdateQueue.length = 0;
  mockSetCaptures.length = 0;
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
  c.groupBy = jest.fn(pass);
  c.set = jest.fn((v: Record<string, unknown>) => {
    mockSetCaptures.push(v);
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

jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: jest.fn(async () => true),
  getConfigInt: jest.fn(async (_key: string, fallback: number) => fallback),
  getConfigValue: jest.fn(async (_key: string, fallback: unknown) => fallback),
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

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-1" })),
  requireAnyRole: jest.fn(
    () =>
      async () =>
        Promise.resolve({
          supabaseUser: { id: "auth-1" },
          dbUser: { id: "db-user-1", role: "rider" },
        }),
  ),
}));

// ── §H.6: TTL sweep (broadcasting + expires_at < now → failed) ───────────

describe("Phase 6 — emergency TTL sweep (job 53)", () => {
  it("sweeps expired broadcasting requests to failed with ttl_expired", async () => {
    mockSetCaptures.length = 0;
    mockQueueUpdate([{ id: "e1" }, { id: "e2" }]);
    const count = await sweepExpiredEmergencies();
    expect(count).toBe(2);
    expect(mockSetCaptures[0]).toMatchObject({
      status: "failed",
      failure_reason: "ttl_expired",
    });
  });

  it("returns 0 when nothing is expired", async () => {
    mockSetCaptures.length = 0;
    mockQueueUpdate([]);
    const count = await sweepExpiredEmergencies();
    expect(count).toBe(0);
  });
});

// ── §H.6: cert renewal (PATCH → pending, admin re-reviews, F12) ──────────

describe("Phase 6 — certification renewal (F12)", () => {
  const CERT_ID = "77777777-7777-4777-8777-777777777777";

  it("renew resets the pair to pending and clears the review", async () => {
    mockSetCaptures.length = 0;
    mockQueueSelect([
      {
        id: CERT_ID,
        user_id: "db-user-1",
        vehicle_id: "veh-1",
        certification_status: "verified",
        service_level: "ALS",
        cert_number: "OLD-1",
        issuing_body: "Gov",
        issued_at: null,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        document_urls: [],
      },
    ]);
    mockQueueUpdate([{ id: CERT_ID }]);

    const req = new Request(`http://localhost/api/ambulance/certifications/${CERT_ID}/renew`, {
      method: "PATCH",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify({
        service_level: "ALS",
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        document_urls: ["https://example.com/new-cert.pdf"],
      }),
    });
    const res = await renewPATCH(req, { id: CERT_ID });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("pending");
    expect(mockSetCaptures[0]).toMatchObject({
      certification_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
    });
  });

  it("renew is owner-only (403 for anyone else)", async () => {
    mockQueueSelect([{ id: CERT_ID, user_id: "someone-else" }]);
    const req = new Request(`http://localhost/api/ambulance/certifications/${CERT_ID}/renew`, {
      method: "PATCH",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify({ service_level: "BLS" }),
    });
    const res = await renewPATCH(req, { id: CERT_ID });
    expect(res.status).toBe(403);
  });
});

// ── §H.6: service_level cross-field (F2 — rental shim, real Zod) ─────────

describe("Phase 6 — ambulance_scheduled cross-field (F2)", () => {
  const baseBody = {
    category: "ambulance_scheduled",
    urgency: "alarm",
    pickup_address: "A",
    pickup_lat: 23.81,
    pickup_lng: 90.41,
    dropoff_address: "B",
    dropoff_lat: 23.82,
    dropoff_lng: 90.42,
    patient_condition: "stable",
    tracking_required: false,
  };

  it("rejects ambulance_scheduled without service_level (400 service_level_required)", async () => {
    mockQueueSelect([{ cnt: 0 }]);
    const res = await rentalRequestsPOST(
      new Request("http://localhost/api/rental/requests", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(baseBody),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("service_level_required");
  });

  it("rejects requires_paramedic with BLS (400 paramedic_requires_als)", async () => {
    mockQueueSelect([{ cnt: 0 }]);
    const res = await rentalRequestsPOST(
      new Request("http://localhost/api/rental/requests", {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ ...baseBody, service_level: "BLS", requires_paramedic: true }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("paramedic_requires_als");
  });
});

// ── §H.6: broadcast eligibility (verified + online + ring + level) ───────

describe("Phase 6 — emergency broadcast eligibility (§C.6)", () => {
  const pickup = { lat: 23.8103, lng: 90.4125 };
  const far = { lat: 22.3569, lng: 91.7832 }; // Chittagong — outside the ring
  const future = new Date(Date.now() + 86400000);
  const past = new Date(Date.now() - 86400000);

  it("includes ALS holders for BLS requests (BLS ⊂ ALS), excludes out-of-ring and expired", async () => {
    mockQueueSelect([
      {
        // in-ring ALS — eligible for both levels
        user_id: "drv-als",
        service_level: "ALS",
        expires_at: future,
        h3_cell: mockGetH3Cell(pickup.lat, pickup.lng),
      },
      {
        // in-ring BLS — BLS requests only
        user_id: "drv-bls",
        service_level: "BLS",
        expires_at: future,
        h3_cell: "ring-cell-1",
      },
      {
        // out-of-ring ALS — excluded
        user_id: "drv-far",
        service_level: "ALS",
        expires_at: future,
        h3_cell: mockGetH3Cell(far.lat, far.lng),
      },
      {
        // in-ring but EXPIRED — excluded
        user_id: "drv-exp",
        service_level: "ALS",
        expires_at: past,
        h3_cell: mockGetH3Cell(pickup.lat, pickup.lng),
      },
    ]);

    const blsTargets = await getEligibleEmergencyDriverUserIds(pickup.lat, pickup.lng, "BLS");
    expect(blsTargets.sort()).toEqual(["drv-als", "drv-bls"]);
  });

  it("ALS requests exclude BLS-only holders", async () => {
    mockQueueSelect([
      {
        user_id: "drv-als",
        service_level: "ALS",
        expires_at: future,
        h3_cell: mockGetH3Cell(pickup.lat, pickup.lng),
      },
      {
        user_id: "drv-bls",
        service_level: "BLS",
        expires_at: future,
        h3_cell: "ring-cell-1",
      },
    ]);
    const alsTargets = await getEligibleEmergencyDriverUserIds(pickup.lat, pickup.lng, "ALS");
    expect(alsTargets).toEqual(["drv-als"]);
  });
});

// ── §H.6: §B.5 transitions + first-accept-wins race ──────────────────────


describe("Phase 6 — emergency chain transitions (§B.5)", () => {
  beforeEach(() => {
    mockSetCaptures.length = 0;
  });

  it("assigned → en_route_pickup by the assignee stamps en_route_pickup_at", async () => {
    mockQueueSelect([
      { id: "e1", status: "assigned", caller_user_id: "caller-1", accepted_cert_id: "cert-1", expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    mockQueueSelect([{ user_id: "driver-1" }]); // cert lookup
    mockQueueUpdate([{ id: "e1", caller_user_id: "caller-1", status: "en_route_pickup" }]);

    const updated = await transitionEmergencyRequest("e1", "driver-1", "en_route_pickup");
    expect(updated.status).toBe("en_route_pickup");
    expect(mockSetCaptures[0]).toMatchObject({
      status: "en_route_pickup",
      en_route_pickup_at: expect.any(Date),
    });
  });

  it("rejects non-assignee transitions (403)", async () => {
    mockQueueSelect([
      { id: "e1", status: "assigned", accepted_cert_id: "cert-1", expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    mockQueueSelect([{ user_id: "someone-else" }]); // cert lookup
    await expect(
      transitionEmergencyRequest("e1", "driver-1", "arrived"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects invalid transitions (completed → en_route_pickup, 409)", async () => {
    mockQueueSelect([
      { id: "e1", status: "completed", accepted_cert_id: "cert-1", expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    mockQueueSelect([{ user_id: "driver-1" }]); // cert lookup
    await expect(
      transitionEmergencyRequest("e1", "driver-1", "en_route_pickup"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("caller cancels a broadcasting emergency (cancelled stamp)", async () => {
    mockQueueSelect([
      { id: "e1", status: "broadcasting", caller_user_id: "caller-1", accepted_cert_id: null },
    ]);
    mockQueueUpdate([{ id: "e1", status: "cancelled" }]);

    const updated = await cancelEmergencyRequest("e1", "caller-1", "changed mind");
    expect(updated.status).toBe("cancelled");
    expect(mockSetCaptures[0]).toMatchObject({
      status: "cancelled",
      cancelled_at: expect.any(Date),
      cancel_reason: "changed mind",
    });
  });

  it("cancel is blocked on terminal states (409)", async () => {
    mockQueueSelect([
      { id: "e1", status: "failed", caller_user_id: "caller-1", accepted_cert_id: null },
    ]);
    await expect(cancelEmergencyRequest("e1", "caller-1")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("Phase 6 — first-accept-wins accept race (§B.0)", () => {
  beforeEach(() => {
    mockSetCaptures.length = 0;
  });

  it("first accept wins: conditional update assigns; loser (already assigned) gets 409", async () => {
    // Winner — ONE queue entry PER select statement
    mockQueueSelect([
      {
        id: "e1",
        status: "broadcasting",
        caller_user_id: "caller-1",
        accepted_cert_id: null,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ]);
    mockQueueSelect([{ id: "d1" }]); // drivers-row FOR UPDATE
    mockQueueSelect([]); // active rental — none
    mockQueueSelect([]); // active delivery leg — none
    mockQueueSelect([]); // other active emergency — none
    mockQueueUpdate([{ id: "e1", status: "assigned", caller_user_id: "caller-1", accepted_cert_id: "cert-1" }]);
    mockQueueSelect([{ name: "Ambu Driver", phone: "+8801700000000", manufacturer: "Toyota", model: "Hiace" }]); // emitAssigned lookup

    const winner = await acceptEmergencyRequest("e1", "cert-1", "driver-1");
    expect(winner.status).toBe("assigned");
    expect(mockSetCaptures[0]).toMatchObject({
      status: "assigned",
      accepted_cert_id: "cert-1",
    });

    // Loser — racing accept sees status='assigned' → 409, exactly one assignee
    mockQueueSelect([
      {
        id: "e1",
        status: "assigned",
        caller_user_id: "caller-1",
        accepted_cert_id: "cert-1",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ]);
    await expect(acceptEmergencyRequest("e1", "cert-2", "driver-2")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("losing the conditional update itself → 409 concurrent_transition", async () => {
    mockQueueSelect([
      {
        id: "e1",
        status: "broadcasting",
        caller_user_id: "caller-1",
        accepted_cert_id: null,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ]);
    mockQueueSelect([{ id: "d1" }]);
    mockQueueSelect([]); // rental
    mockQueueSelect([]); // delivery
    mockQueueSelect([]); // emergency
    mockQueueUpdate([]); // 0 rows — another tx won between read and write

    await expect(acceptEmergencyRequest("e1", "cert-1", "driver-1")).rejects.toMatchObject({
      status: 409,
      message: "concurrent_transition",
    });
  });

  it("accept is §B.7-guarded: driver with an active delivery leg gets 409", async () => {
    mockQueueSelect([
      {
        id: "e1",
        status: "broadcasting",
        caller_user_id: "caller-1",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ]);
    mockQueueSelect([{ id: "d1" }]);
    mockQueueSelect([]); // rental — none
    mockQueueSelect([{ id: "leg-1" }]); // ACTIVE DELIVERY LEG — blocks
    await expect(acceptEmergencyRequest("e1", "cert-1", "driver-1")).rejects.toMatchObject({
      status: 409,
      message: "driver_already_committed",
    });
  });
});
