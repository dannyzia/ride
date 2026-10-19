/**
 * D5-1 — products management route validates `image_urls` against the
 * catalog folder policy: only Ride-owned storage under `catalog/` (or a
 * legacy-bucket row) is persisted. An external URL 400s instead of
 * becoming a spoofable storefront image.
 */
import { jest } from "@jest/globals";
import { POST, PATCH } from "@/app/api/shop/[id]/products+api";

jest.mock("@/lib/marketplaceRbac", () => ({
  requireShopMember: jest.fn((_shopId?: string, _allowed?: string[]) => async () => ({
    supabaseUser: {},
    dbUser: { id: "db-user-1", role: "rider" },
    membership: { id: "mem-1", role: "OWNER" },
  })),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

function mockChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit", "set"]) {
    c[m] = jest.fn().mockReturnValue(c);
  }
  c.values = jest.fn().mockReturnValue(c);
  c.returning = jest.fn(async () => rows);
  c.then = (r: (v: unknown) => unknown) => r(rows);
  return c;
}

jest.mock("@/src/db", () => ({
  db: {
    insert: jest.fn(() => mockChain([{ id: "prod-1" }])),
    update: jest.fn(() => mockChain([])),
  },
} as unknown as Record<string, unknown>));

const SHOP = "0a000001-0000-4000-8000-000000000001";
const UID = "11111111-1111-4111-a111-111111111111";
const R2 = "https://assets.ride.com.bd";
const CATALOG_URL = `${R2}/catalog/${UID}/1790064328594-abcdef12-p.jpg`;

function req(body: unknown): Request {
  return new Request(`http://test/shop/${SHOP}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Direct assignment (not wholesale process.env replacement — the latter does
// not propagate inside this jest VM; cf. withEnv in storageFolders.test.ts).
const prevR2 = process.env.EXPO_PUBLIC_R2_DOMAIN;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_R2_DOMAIN = R2;
});

afterAll(() => {
  if (prevR2 === undefined) delete process.env.EXPO_PUBLIC_R2_DOMAIN;
  else process.env.EXPO_PUBLIC_R2_DOMAIN = prevR2;
});

describe("D5-1 products image_urls — catalog folder policy", () => {
  it("POST 400s an external image URL", async () => {
    const res = await POST(
      req({ name: "P", price_bdt: 100, image_urls: ["https://evil.example/x.jpg"] }),
      { id: SHOP },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_image_url");
  });

  it("POST persists a catalog-folder R2 URL", async () => {
    const res = await POST(
      req({ name: "P", price_bdt: 100, image_urls: [CATALOG_URL] }),
      { id: SHOP },
    );
    expect(res.status).toBe(201);
  });

  it("PATCH 400s an external image URL", async () => {
    const res = await PATCH(
      req({ id: "0b000001-0000-4000-8000-000000000001", image_urls: ["https://evil.example/x.jpg"] }),
      { id: SHOP },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_image_url");
  });
});
