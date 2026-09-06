/**
 * Admin hotspots CRUD (zone_heat tier assignments).
 *
 * Invariants:
 *  - Every method is config.write-gated: owner/admin pass, moderator (and
 *    unauthenticated callers) get 403/401.
 *  - POST bulk-adds tiers with the tier→tag mapping (low→cold,
 *    medium→neutral, high→hot) and stores the validity window.
 *  - POST rejects unknown zone_ids and inverted validity windows.
 *  - DELETE removes the zone_heat row by id (zone_id PK); 404 when absent.
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), delete: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/hotspot", () => ({
  tagFromTier: (tier: string) =>
    tier === "high" ? "hot" : tier === "medium" ? "neutral" : "cold",
  clearHotspotCache: jest.fn(),
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { clearHotspotCache } from "@/lib/hotspot";
import * as route from "@/app/api/admin/hotspots+api";

const ZONE_A = "11111111-1111-4111-8111-111111111111";
const ZONE_B = "22222222-2222-4222-8222-222222222222";
const ZONE_MISSING = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown, url = "http://localhost/api/admin/hotspots"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

const allowedPerms = new Set<string>();
function setAllowed(perms: string[]): void {
  allowedPerms.clear();
  perms.forEach((p) => allowedPerms.add(p));
  (requireAdminPermission as jest.Mock).mockImplementation((perm: string) =>
    allowedPerms.has(perm)
      ? jest.fn(async () => ({
          supabaseUser: { id: "sb-admin-1" },
          dbUser: { id: "admin-1", role: "owner" },
        }))
      : jest.fn(async () => {
          throw { status: 403 };
        }),
  );
}

const inserts: { table: unknown; values: unknown }[] = [];

/** Awaitable drizzle builder mock — every method returns the chain, and the
 *  chain itself is thenable (the route awaits both `.offset()` results and
 *  bare `db.select(...).from(t)` count queries). */
function makeChain(rows: Row[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.offset = jest.fn(() => chain);
  chain.then = (
    res?: (v: unknown) => unknown,
    rej?: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(res, rej);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  inserts.length = 0;
  setAllowed(["config.write"]);

  // 1st select: the paginated row query; 2nd: the count(*) query — which the
  // route destructures, so it must always yield one row.
  let selectCall = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    selectCall += 1;
    return makeChain(selectCall === 1 ? [] : [{ count: 0 }]);
  });
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: unknown) => {
      inserts.push({ table, values: v });
      return {
        onConflictDoUpdate: jest.fn(async () => undefined),
        returning: jest.fn(async () => [v as Row]),
      };
    }),
  }));
  (db.delete as jest.Mock).mockImplementation(() => ({
    where: jest.fn(() => ({
      returning: jest.fn(async () => [{ zone_id: ZONE_A }]),
    })),
  }));
});

describe("auth", () => {
  test("owner passes and moderator is 403 on every method", async () => {
    setAllowed([]); // moderator holds neither config.write nor safety.write here
    expect((await route.GET(jsonRequest())).status).toBe(403);
    expect(
      (await route.POST(jsonRequest({ items: [{ zone_id: ZONE_A, tier: "low" }] }))).status,
    ).toBe(403);
    expect((await route.DELETE(jsonRequest(undefined, `http://x/?id=${ZONE_A}`))).status).toBe(403);
  });

  test("config.write passes for owner", async () => {
    setAllowed(["config.write"]);
    expect((await route.GET(jsonRequest())).status).toBe(200);
  });
});

describe("GET", () => {
  test("paginates and reports the total", async () => {
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call += 1;
      // 1st call: the paginated row query; 2nd: the count query.
      return makeChain(
        call === 1
          ? [{ zone_id: ZONE_A, zone_name: "Mirpur", tag: "hot", score: "0.9" }]
          : [{ count: 7 }],
      );
    });

    const res = await route.GET(jsonRequest(undefined, "http://x/?limit=10&offset=20"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.total).toBe(7);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(20);
    expect((body.hotspots as Row[])[0].zone_name).toBe("Mirpur");
  });

  test("sanitizes bogus limit/offset params", async () => {
    const res = await route.GET(jsonRequest(undefined, "http://x/?limit=abc&offset=-5"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });
});

describe("POST bulk add", () => {
  test("upserts tier→tag with the validity window", async () => {
    // Zone existence check must find both zones.
    (db.select as jest.Mock).mockImplementation(() =>
      makeChain([{ id: ZONE_A }, { id: ZONE_B }]),
    );
    const res = await route.POST(
      jsonRequest({
        items: [
          { zone_id: ZONE_A, tier: "high", valid_from: "2026-09-06T00:00:00Z", valid_to: "2026-09-07T00:00:00Z" },
          { zone_id: ZONE_B, tier: "low" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.added).toBe(2);

    expect(inserts[0].values).toMatchObject({
      zone_id: ZONE_A,
      tag: "hot",
      valid_from: new Date("2026-09-06T00:00:00Z"),
      valid_to: new Date("2026-09-07T00:00:00Z"),
    });
    expect(inserts[1].values).toMatchObject({ zone_id: ZONE_B, tag: "cold", valid_from: null, valid_to: null });
    expect(clearHotspotCache).toHaveBeenCalled();
  });

  test("400 with unknown_zone listing the missing ids", async () => {
    (db.select as jest.Mock).mockImplementation(() => makeChain([{ id: ZONE_A }]));
    const res = await route.POST(
      jsonRequest({ items: [{ zone_id: ZONE_MISSING, tier: "medium" }] }),
    );
    expect(res.status).toBe(400);
    const body = await getJson(res);
    expect(body.error).toBe("unknown_zone");
    expect(inserts).toHaveLength(0);
  });

  test("400 on inverted validity window", async () => {
    const res = await route.POST(
      jsonRequest({
        items: [
          { zone_id: ZONE_A, tier: "high", valid_from: "2026-09-07T00:00:00Z", valid_to: "2026-09-06T00:00:00Z" },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 on invalid body (bad tier / bad uuid / empty items)", async () => {
    const badTier = await route.POST(jsonRequest({ items: [{ zone_id: ZONE_A, tier: "surge" }] }));
    expect(badTier.status).toBe(400);
    const badUuid = await route.POST(jsonRequest({ items: [{ zone_id: "nope", tier: "low" }] }));
    expect(badUuid.status).toBe(400);
    const empty = await route.POST(jsonRequest({ items: [] }));
    expect(empty.status).toBe(400);
  });
});

describe("DELETE", () => {
  test("removes by id and busts the cache", async () => {
    const res = await route.DELETE(jsonRequest(undefined, `http://x/?id=${ZONE_A}`));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    expect(clearHotspotCache).toHaveBeenCalled();
  });

  test("400 invalid_uuid and 404 when the row is gone", async () => {
    const bad = await route.DELETE(jsonRequest(undefined, "http://x/?id=not-a-uuid"));
    expect(bad.status).toBe(400);

    (db.delete as jest.Mock).mockImplementation(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => []),
      })),
    }));
    const missing = await route.DELETE(jsonRequest(undefined, `http://x/?id=${ZONE_B}`));
    expect(missing.status).toBe(404);
  });

  test("400 when the id param is absent", async () => {
    const res = await route.DELETE(jsonRequest(undefined, "http://x/"));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
  });
});
