/**
 * D4-1 — Public GET /api/shop/[id] must not leak internal shop columns.
 * The route selects an explicit business-field whitelist (the shop/list
 * pattern); this test feeds a FULL shop row (owner_user_id, the whole
 * verification_* family incl. verification_reject.internal_note, doc URLs,
 * operational columns) through the mocked DB and asserts NONE of it reaches
 * the public response. Fails on the old select()+spread implementation.
 */
import { jest } from "@jest/globals";
import { GET } from "@/app/api/shop/[id]+api";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ─── Mock DB (house select-queue pattern) ───────────────────────────────────
let mockSelectQueue: (() => unknown[])[ ] = [];

function mockChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "leftJoin", "orderBy"]) {
    c[m] = jest.fn().mockReturnValue(c);
  }
  c.then = (r: (v: unknown) => unknown) => r(rows);
  return c;
}

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(() => mockChain(mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [])),
  },
} as unknown as Record<string, unknown>));

const SHOP_ID = "0a000001-0000-4000-8000-000000000001";
const OWNER_ID = "0b000001-0000-4000-8000-000000000002";

// Full shops row as the REAL select() would have returned it pre-fix.
const FULL_SHOP_ROW = {
  id: SHOP_ID,
  owner_user_id: OWNER_ID,
  name: "Test Shop",
  slug: "test-shop",
  description: "A shop",
  logo_url: "https://x/logo.png",
  banner_url: "https://x/banner.png",
  phone: "8801700000001",
  address_line: "Dhaka",
  lat: "23.810300",
  lng: "90.412500",
  status: "active",
  is_verified: true,
  shop_type_id: "0c000001-0000-4000-8000-000000000003",
  license_url: "https://x/license.png",
  food_safety_cert_url: "https://x/fss.png",
  rating: "4.50",
  rating_count: 12,
  is_open: true,
  busy: false,
  verification_status: "approved",
  verification_reason: "looks fine",
  verification_decided_at: "2026-10-01T00:00:00Z",
  verification_reject: { code: "blurry", field: "license", example: "x", internal_note: "repeat offender" },
  verification_resubmit_count: 1,
  verification_decided_by: "0d000001-0000-4000-8000-000000000004",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  deleted_at: null,
};

const PUBLIC_SHOP_KEYS = [
  "id", "name", "slug", "description", "logo_url", "phone",
  "lat", "lng", "is_verified", "is_open", "busy", "rating", "created_at",
].sort();

function getReq(id: string) {
  return new Request(`http://test/shop/${id}`, { method: "GET" });
}

beforeEach(() => {
  mockSelectQueue = [];
});

describe("D4-1 public shop detail — no internal-field leak", () => {
  it("returns business fields only (whitelist is its own proof)", async () => {
    mockSelectQueue = [
      () => [FULL_SHOP_ROW],
      () => [],
      () => [{ memberCount: 0 }],
    ];
    const res = await GET(getReq(SHOP_ID), { id: SHOP_ID });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shop: Record<string, unknown> };
    // Exact key set: nothing more may leave the server.
    expect(Object.keys(body.shop).sort()).toEqual(PUBLIC_SHOP_KEYS);
    // Belt-and-braces on the named leak fields (incl. nested internal_note).
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("owner_user_id");
    expect(raw).not.toContain("verification_reject");
    expect(raw).not.toContain("verification_status");
    expect(raw).not.toContain("verification_reason");
    expect(raw).not.toContain("verification_decided");
    expect(raw).not.toContain("verification_resubmit");
    expect(raw).not.toContain("internal_note");
    expect(raw).not.toContain("license_url");
    expect(raw).not.toContain(OWNER_ID);
    // Business values still correct (numeric strings coerced).
    expect(body.shop.name).toBe("Test Shop");
    expect(body.shop.lat).toBe(23.8103);
    expect(body.shop.lng).toBe(90.4125);
    expect(body.shop.is_verified).toBe(true);
  });

  it("404s when no active, non-deleted shop matches", async () => {
    mockSelectQueue = [() => []];
    const res = await GET(getReq(SHOP_ID), { id: SHOP_ID });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("shop_not_found");
  });

  it("400s on a non-UUID id", async () => {
    const res = await GET(getReq("not-a-uuid"), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_uuid");
  });
});
