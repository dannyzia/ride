/**
 * D1-1 rate-basis pin — admin/pricing is APPEND-VERSIONED.
 *
 * Contract under test (app/api/admin/pricing+api.ts PATCH):
 *  - an edit NEVER mutates the live row: it mints a successor (copied rates
 *    + changes, supersedes_id = old id) and deactivates the predecessor, in
 *    one tx. A mid-ride edit therefore cannot move a pinned ride's basis.
 *  - saving with no rate changes 400s (no version spam).
 *  - flipping is_active outside versioning/rollback 400s.
 *  - editing a superseded row 400s (history is immutable).
 *  - rollback moves the is_active pointer to a same-lineage ancestor (no
 *    insert); cross-lineage targets 400.
 *  - a concurrent edit that wins first turns the loser into a 409
 *    version_race (row lock + in-tx recheck), never a forked basis.
 *  - floor_length_km is string-coerced for numeric(10,2) (P2-24 invariant,
 *    moved here from catalog.test.ts whose in-place PATCH tests this
 *    redesign supersedes).
 *
 * DB is a queue/table-aware mock (house pattern); the route's real
 * diff/lineage logic runs.
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(() => jest.fn(async () => ({ dbUser: { id: "admin-1" } }))),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { pricing } from "@/src/db/schema";
import { PATCH } from "@/app/api/admin/pricing+api";

type Row = Record<string, unknown>;

const ZONE = "11111111-1111-4111-a111-111111111111";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const V2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

const V1_ROW: Row = {
  id: V1,
  zone_id: ZONE,
  vehicle_type: "bike_basic",
  base_fare_bdt: 5000,
  per_km_bdt: 2000,
  intercity_per_km_bdt: 0,
  per_min_bdt: 300,
  floor_length_km: "2",
  floor_min: 5,
  platform_commission_percent: "0",
  free_wait_minutes: 3,
  wait_fee_per_minute_bdt: 200,
  brta_fare_ceiling_bdt: null,
  base_km: "0",
  initiation_minutes: 4,
  is_active: true,
  supersedes_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let selectQueue: Row[][];
let inserted: { table: unknown; values: Row }[];
let updated: { table: unknown; set: Row }[];

function chain(rows: Row[]) {
  // limit() returns a thenable that ALSO carries .for (the route locks with
  // .limit(1).for("update"), same shape as cancel+api), so both
  // `await ...limit(1)` and `await ...limit(1).for("update")` resolve rows.
  const limitResult = () => {
    const p = Promise.resolve(rows);
    (p as unknown as Record<string, unknown>).for = () => Promise.resolve(rows);
    return p;
  };
  const c: Record<string, unknown> = {
    from: jest.fn(() => c),
    where: jest.fn(() => c),
    limit: jest.fn(() => limitResult()),
    for: jest.fn(() => ({ limit: jest.fn(async () => rows) })),
  };
  return c;
}

function wireDb() {
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = selectQueue.length > 0 ? (selectQueue.shift() ?? []) : [];
    return chain(rows);
  });
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((vals: Row) => {
      inserted.push({ table, values: vals });
      return { returning: jest.fn(async () => [{ id: V2, ...vals }]) };
    }),
  }));
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updated.push({ table, set: setObj });
      return {
        where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: V1, ...setObj }]) })),
      };
    }),
  }));
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ select: (db.select as jest.Mock), insert: (db.insert as jest.Mock), update: (db.update as jest.Mock) }),
  );
}

function patchRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

const RATE_KEYS = [
  "base_fare_bdt",
  "per_km_bdt",
  "intercity_per_km_bdt",
  "per_min_bdt",
  "floor_length_km",
  "floor_min",
  "platform_commission_percent",
  "brta_fare_ceiling_bdt",
  "free_wait_minutes",
  "wait_fee_per_minute_bdt",
  "base_km",
  "initiation_minutes",
];

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue = [];
  inserted = [];
  updated = [];
  wireDb();
});

describe("PATCH /api/admin/pricing — append-versioned edits (D1-1)", () => {
  it("mints a successor version: old row deactivated, rates copied + changed, never mutated", async () => {
    // Route selects: row by id, then in-tx the locked row.
    selectQueue = [[{ ...V1_ROW }], [{ ...V1_ROW }]];
    const res = await PATCH(patchRequest({ id: V1, per_km_bdt: 2500, floor_length_km: 1.5 }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.pricing.id).toBe(V2);
    expect(body.superseded_id).toBe(V1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      per_km_bdt: 2500,
      floor_length_km: "1.5", // numeric(10,2) column expects a string
      base_fare_bdt: 5000, // carried forward
      zone_id: ZONE, // scope carried forward
      vehicle_type: "bike_basic",
      is_active: true,
      supersedes_id: V1,
    });

    // The predecessor is deactivated — and NO rate key is ever written to an
    // existing row. This is the immutability pin: a mid-ride edit cannot move
    // a pinned ride's basis.
    const pricingUpdates = updated.filter((u) => u.table === pricing);
    expect(pricingUpdates).toHaveLength(1);
    expect(pricingUpdates[0].set.is_active).toBe(false);
    for (const u of pricingUpdates) {
      for (const k of RATE_KEYS) expect(u.set).not.toHaveProperty(k);
    }
  });

  it("400 no_changes when nothing differs — no version spam", async () => {
    selectQueue = [[{ ...V1_ROW }]];
    const res = await PATCH(
      patchRequest({ id: V1, per_km_bdt: 2000, floor_length_km: 2, is_active: true }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_changes");
    expect(inserted).toHaveLength(0);
  });

  it("400 edit_historical when the target is a superseded row", async () => {
    selectQueue = [[{ ...V1_ROW, is_active: false }]];
    const res = await PATCH(patchRequest({ id: V1, per_km_bdt: 2500 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("edit_historical");
    expect(inserted).toHaveLength(0);
  });

  it("400 is_active_not_versioned when flipping the pointer outside versioning", async () => {
    selectQueue = [[{ ...V1_ROW }]];
    const res = await PATCH(patchRequest({ id: V1, per_km_bdt: 2000, is_active: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("is_active_not_versioned");
    expect(inserted).toHaveLength(0);
  });

  it("409 version_race when a concurrent edit wins first (in-tx recheck)", async () => {
    // Pre-tx read sees the live row; the in-tx locked read sees it deactivated.
    selectQueue = [[{ ...V1_ROW }], [{ ...V1_ROW, is_active: false }]];
    const res = await PATCH(patchRequest({ id: V1, per_km_bdt: 2500 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("version_race");
    expect(inserted).toHaveLength(0);
  });

  it("404 pricing_not_found when the row is gone", async () => {
    selectQueue = [[]];
    const res = await PATCH(patchRequest({ id: V1, per_km_bdt: 2500 }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/admin/pricing — pointer-move rollback (D1-1)", () => {
  const V2_ROW: Row = { ...V1_ROW, id: V2, per_km_bdt: 2500, supersedes_id: V1 };
  const V1_HIST: Row = { ...V1_ROW, is_active: false };

  it("reactivates a same-lineage ancestor with no insert", async () => {
    // Row by id (historical v1), current active (v2 whose chain contains v1).
    selectQueue = [[V1_HIST], [V2_ROW]];
    const res = await PATCH(patchRequest({ id: V1, rollback: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rolled_back_from).toBe(V2);
    expect(inserted).toHaveLength(0);
    const sets = updated.filter((u) => u.table === pricing).map((u) => u.set);
    expect(sets).toContainEqual(expect.objectContaining({ is_active: false }));
    expect(sets).toContainEqual(expect.objectContaining({ is_active: true }));
    for (const s of sets) {
      for (const k of RATE_KEYS) expect(s).not.toHaveProperty(k);
    }
  });

  it("400 rollback_redundant when the target is already active", async () => {
    selectQueue = [[{ ...V1_ROW }]];
    const res = await PATCH(patchRequest({ id: V1, rollback: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("rollback_redundant");
  });

  it("400 lineage_mismatch when the target is outside the live chain", async () => {
    // Same zone/type, but the live chain (v2 <- v1b) never passes through v1a.
    const V1A: Row = { ...V1_ROW, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0", is_active: false };
    const V1B: Row = { ...V1_ROW, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", is_active: false };
    const V2C: Row = { ...V1_ROW, id: V2, is_active: true, supersedes_id: V1B.id };
    selectQueue = [[V1A], [V2C], [V1B]];
    const res = await PATCH(patchRequest({ id: V1A.id, rollback: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("lineage_mismatch");
    expect(updated).toHaveLength(0);
  });
});
