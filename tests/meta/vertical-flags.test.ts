/**
 * Node launch Stage 1 (ISSUE-99 / DESIGN-NODE-LAUNCH.md Component A + T1) —
 * vertical-flag plumbing pins.
 *
 * Purpose:     Behavioral + source-level coverage of the ride-hide flag
 *              plumbing: the [public] GET /api/app-config handler shape, the
 *              additive verify-token flags field, the client resolver's
 *              fail-closed semantics (fetch failure / timeout / unconfigured
 *              env / malformed payload), the once-per-boot session cache,
 *              and the T1 admin PATCH acceptance of 'true'/'false' for
 *              ride_vertical_enabled (BOOLEAN_KEYS membership).
 * Owner:       Builder (Node launch loop, ISSUE-99)
 * Status:      ACTIVE
 * Related (concrete paths):
 *   - docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/DESIGN-NODE-LAUNCH.md —
 *     §Detailed Implementation Stage 1 table + T1 (the order this pins)
 *   - lib/verticalFlags.ts — the resolver under test
 *   - app/api/app-config+api.ts — the public read path under test
 *   - app/api/auth/verify-token+api.ts — the authenticated read path
 *   - app/api/admin/config+api.ts + lib/adminRbac.ts — the T1 write path
 * Last verified: 2026-11-11, by Builder — targeted jest run (see STAGE REPORT)
 * How to update: extend with the stage-3+ consumers; never weaken the
 *   fail-closed assertions.
 */
import fs from "fs";
import path from "path";

jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/platformConfig", () => ({
  isRideVerticalEnabled: jest.fn(async () => true),
}));
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));
jest.mock("@/lib/launchRoles", () => ({
  heldRoles: jest.fn(async () => [{ role: "rider", status: "active" }]),
}));
// adminRbac is mocked so the PATCH owner/RBAC plumbing is inert while the
// REAL validateKeyValue (inside the route file — the T1 code under test)
// runs. Membership of ride_vertical_enabled in the REAL owner-only set is
// pinned source-level below.
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(
    () =>
      async () =>
        ({ supabaseUser: { id: "admin-1" }, dbUser: { id: "admin-1", role: "owner" } }),
  ),
  isOwner: jest.fn(() => true),
  OWNER_ONLY_CONFIG_KEYS: new Set<string>(),
  GUARDRAIL_KM_KEYS: new Set<string>(),
  guardrailViolation: jest.fn(() => false),
}));

import { db } from "@/src/db";
import { isRideVerticalEnabled } from "@/lib/platformConfig";
import { supabaseAdmin } from "@/lib/supabaseServer";
import {
  applyVerifyTokenFlags,
  DEFAULT_RIDE_VERTICAL_ENABLED,
  FETCH_TIMEOUT_MS,
  fetchRideVerticalFlag,
  getRideVerticalEnabled,
  resetVerticalFlagCacheForTests,
  RETRY_TIMEOUT_MS,
  RIDE_FLAG_RESOLVE_TIMEOUT_MS,
  waitForRideVerticalFlag,
} from "@/lib/verticalFlags";
import { GET as appConfigGET } from "@/app/api/app-config+api";
import { POST as verifyTokenPOST } from "@/app/api/auth/verify-token+api";
import { PATCH as adminConfigPATCH } from "@/app/api/admin/config+api";

const ROOT = path.resolve(__dirname, "../..");
const KEY = "ride_vertical_enabled";

type Row = Record<string, unknown>;

const flagMock = isRideVerticalEnabled as unknown as jest.Mock;
const getUserMock = supabaseAdmin.auth.getUser as unknown as jest.Mock;
const fromMock = supabaseAdmin.from as unknown as jest.Mock;

/** `{ ok: true, json: ... }` response stub for the resolver's fetch seam. */
function okResponse(payload: unknown): unknown {
  return { ok: true, status: 200, json: async () => payload };
}

/** Select chain serving `limitRows` to `.limit()` and to a bare await. */
function makeSelectChain(limitRows: Row[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => limitRows;
  chain.then = (
    res: (v: Row[]) => unknown,
    rej: (e: unknown) => unknown,
  ) => Promise.resolve(limitRows).then(res, rej);
  return chain;
}

function patchRequest(updates: { key: string; value: string }[]): Request {
  return new Request("http://localhost/api/admin/config", {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
}

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  resetVerticalFlagCacheForTests();
  flagMock.mockResolvedValue(true);
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("lib/verticalFlags — client resolver (Component A)", () => {
  it("fail-closed on fetch failure", async () => {
    global.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local" }),
    ).resolves.toBe(DEFAULT_RIDE_VERTICAL_ENABLED);
    expect(getRideVerticalEnabled()).toBe(false);
  });

  it("fail-closed on fetch timeout (hung response)", async () => {
    global.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local", timeoutMs: 20 }),
    ).resolves.toBe(DEFAULT_RIDE_VERTICAL_ENABLED);
    expect(getRideVerticalEnabled()).toBe(false);
  });

  it("fail-closed on a non-OK app-config status", async () => {
    global.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local" }),
    ).resolves.toBe(false);
  });

  it.each([
    ["malformed envelope", { nope: 1 }],
    ["wrong flag type", { flags: { ride_vertical_enabled: "yes" } }],
    ["missing flag", { flags: {} }],
  ])("fail-closed on %s", async (_label, payload) => {
    global.fetch = (async () => okResponse(payload)) as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local" }),
    ).resolves.toBe(false);
  });

  it("resolves true only on a literal true flag; explicit false stays false", async () => {
    global.fetch = (async () =>
      okResponse({ flags: { ride_vertical_enabled: true } })) as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local" }),
    ).resolves.toBe(true);

    resetVerticalFlagCacheForTests();
    global.fetch = (async () =>
      okResponse({ flags: { ride_vertical_enabled: false } })) as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local" }),
    ).resolves.toBe(false);
  });

  it("fetches exactly once per boot (session cache)", async () => {
    const fetchMock = jest.fn(async () =>
      okResponse({ flags: { ride_vertical_enabled: true } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchRideVerticalFlag({ baseUrl: "http://test.local" });
    await fetchRideVerticalFlag({ baseUrl: "http://test.local" });
    expect(getRideVerticalEnabled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fail-closed on an unconfigured environment (empty base URL) without a network call", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchRideVerticalFlag({ baseUrl: "" })).resolves.toBe(
      DEFAULT_RIDE_VERTICAL_ENABLED,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── G3 / ISSUE-111: fetch-window bounds + one bounded retry ──
  it("retries exactly once after a failed first attempt and succeeds", async () => {
    let calls = 0;
    const fetchMock = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient network blip");
      return okResponse({ flags: { ride_vertical_enabled: true } });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local", timeoutMs: 20 }),
    ).resolves.toBe(true);
    expect(getRideVerticalEnabled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounded: gives up after exactly ONE retry when every attempt fails", async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error("network down");
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local", timeoutMs: 20 }),
    ).resolves.toBe(DEFAULT_RIDE_VERTICAL_ENABLED);
    // Exactly two attempts (first + one retry) — never a retry loop.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getRideVerticalEnabled()).toBe(false);
  });

  it("does NOT retry on a successful read whose value is false", async () => {
    const fetchMock = jest.fn(async () =>
      okResponse({ flags: { ride_vertical_enabled: false } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fetchRideVerticalFlag({ baseUrl: "http://test.local", timeoutMs: 20 }),
    ).resolves.toBe(false);
    // A valid false is a VALUE, not a failure — one call only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("G3 bounds are coherent: consume window exceeds the total fetch window, first attempt in the ordered 5000-8000ms range", () => {
    // Ordered range for the device-path fix (ISSUE-111).
    expect(FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(8000);
    expect(RETRY_TIMEOUT_MS).toBeGreaterThan(0);
    // The consume window must exceed the worst-case fetch (first + retry) or
    // the splash fail-closes on every healthy-but-slow device (the G3 defect).
    expect(RIDE_FLAG_RESOLVE_TIMEOUT_MS).toBeGreaterThan(
      FETCH_TIMEOUT_MS + RETRY_TIMEOUT_MS,
    );
  });

  describe("applyVerifyTokenFlags — authenticated boot path", () => {
    it("fills the unresolved cache from the verify-token flags field", () => {
      applyVerifyTokenFlags({ ride_vertical_enabled: true });
      expect(getRideVerticalEnabled()).toBe(true);
    });

    it("ignores malformed flags (stays fail-closed)", () => {
      applyVerifyTokenFlags({ ride_vertical_enabled: "truthy" });
      applyVerifyTokenFlags("garbage");
      applyVerifyTokenFlags(undefined);
      expect(getRideVerticalEnabled()).toBe(DEFAULT_RIDE_VERTICAL_ENABLED);
    });

    it("never overwrites an already-resolved cache", () => {
      applyVerifyTokenFlags({ ride_vertical_enabled: true });
      applyVerifyTokenFlags({ ride_vertical_enabled: false });
      expect(getRideVerticalEnabled()).toBe(true);
    });
  });

  describe("waitForRideVerticalFlag — bounded consume", () => {
    it("fail-closed immediately when nothing is pending", async () => {
      const started = Date.now();
      await expect(waitForRideVerticalFlag(50)).resolves.toBe(
        DEFAULT_RIDE_VERTICAL_ENABLED,
      );
      expect(Date.now() - started).toBeLessThan(50);
    });

    it("fail-closes when the boot fetch outlasts the window, then serves the settled value", async () => {
      const fetchMock = jest.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(okResponse({ flags: { ride_vertical_enabled: true } }) as Response), 80),
          ),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      void fetchRideVerticalFlag({ baseUrl: "http://test.local" });
      await expect(waitForRideVerticalFlag(10)).resolves.toBe(false);
      await expect(waitForRideVerticalFlag(500)).resolves.toBe(true);
    });
  });
});

describe("GET /api/app-config — public read path", () => {
  it("carries the canonical [public] marker", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/app-config+api.ts"), "utf8");
    expect(src.startsWith("// [public]")).toBe(true);
  });

  it("returns exactly { flags: { ride_vertical_enabled } } — true", async () => {
    const res = await appConfigGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flags: { ride_vertical_enabled: true } });
  });

  it("returns exactly { flags: { ride_vertical_enabled } } — false (fail-closed row absent)", async () => {
    flagMock.mockResolvedValue(false);
    const res = await appConfigGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flags: { ride_vertical_enabled: false } });
  });
});

describe("POST /api/auth/verify-token — additive flags field", () => {
  function stubSupabaseChain() {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "u1",
                  role: "rider",
                  phone: null,
                  name: null,
                  account_status: "active",
                  suspension_reason: null,
                  deleted_at: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            is: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          }),
        }),
      };
    });
  }

  it("respond() payload carries flags.ride_vertical_enabled = true", async () => {
    stubSupabaseChain();
    const res = await verifyTokenPOST(
      new Request("http://localhost/api/auth/verify-token", {
        method: "POST",
        headers: { Authorization: "Bearer tok" },
      }),
    );
    const body = (await res.json()) as { exists: boolean; flags: { ride_vertical_enabled: boolean } };
    expect(body.exists).toBe(true);
    expect(body.flags).toEqual({ ride_vertical_enabled: true });
  });

  it("respond() payload carries flags.ride_vertical_enabled = false when the row says hidden", async () => {
    stubSupabaseChain();
    flagMock.mockResolvedValue(false);
    const res = await verifyTokenPOST(
      new Request("http://localhost/api/auth/verify-token", {
        method: "POST",
        headers: { Authorization: "Bearer tok" },
      }),
    );
    const body = (await res.json()) as { flags: { ride_vertical_enabled: boolean } };
    expect(body.flags).toEqual({ ride_vertical_enabled: false });
  });
});

describe("PATCH /api/admin/config — T1 boolean acceptance (real validateKeyValue)", () => {
  function stubDbForPatch() {
    (db.select as jest.Mock).mockImplementation(() => makeSelectChain([]));
    const insertValues = jest.fn((_vals: Record<string, unknown>) => Promise.resolve());
    (db.insert as jest.Mock).mockImplementation(() => ({ values: insertValues }));
    (db.update as jest.Mock).mockImplementation(() => ({
      set: () => ({ where: async () => undefined }),
    }));
    return { insertValues };
  }

  it("accepts 'true' for ride_vertical_enabled (BOOLEAN_KEYS branch)", async () => {
    const { insertValues } = stubDbForPatch();
    const res = await adminConfigPATCH(patchRequest([{ key: KEY, value: "true" }]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: [] });
    expect(insertValues).toHaveBeenCalledTimes(1);
    const auditRow = insertValues.mock.calls[0][0];
    expect(auditRow.config_key).toBe(KEY);
    expect(auditRow.new_value).toBe("true");
  });

  it("accepts 'false' for ride_vertical_enabled", async () => {
    stubDbForPatch();
    const res = await adminConfigPATCH(patchRequest([{ key: KEY, value: "false" }]));
    expect(res.status).toBe(200);
  });

  it.each([
    ["numeric-looking '1'", "1"],
    ["garbage string", "maybe"],
  ])("rejects %s with the boolean-branch message (not the numeric fallback)", async (_label, value) => {
    stubDbForPatch();
    const res = await adminConfigPATCH(patchRequest([{ key: KEY, value }]));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain(`must be 'true' or 'false'`);
  });
});

describe("Stage 1 source pins (fresh-DB seed + T1 membership)", () => {
  it("seed script seeds ride_vertical_enabled='true' and counts (41 keys)", () => {
    const seedSrc = fs.readFileSync(path.join(ROOT, "scripts/seed-platform-config.js"), "utf8");
    expect(seedSrc).toMatch(/\(\s*'ride_vertical_enabled'\s*,\s*'true'\s*,\s*now\(\)\s*\)/);
    expect(seedSrc).toContain("platform_config seeded (41 keys)");
  });

  it("key is in ALLOWED_KEYS and BOOLEAN_KEYS (route source)", () => {
    const routeSrc = fs.readFileSync(path.join(ROOT, "app/api/admin/config+api.ts"), "utf8");
    const allowedBlock = routeSrc.slice(
      routeSrc.indexOf("ALLOWED_KEYS = new Set"),
      routeSrc.indexOf("BOOLEAN_KEYS = new Set"),
    );
    expect(allowedBlock).toContain("'ride_vertical_enabled'");
    const boolBlock = routeSrc.slice(
      routeSrc.indexOf("BOOLEAN_KEYS = new Set"),
      routeSrc.indexOf("CSV_KEYS = new Set"),
    );
    expect(boolBlock).toContain("'ride_vertical_enabled'");
  });

  it("key is in OWNER_ONLY_CONFIG_KEYS (lib/adminRbac.ts source)", () => {
    const rbacSrc = fs.readFileSync(path.join(ROOT, "lib/adminRbac.ts"), "utf8");
    const ownerBlock = rbacSrc.slice(
      rbacSrc.indexOf("OWNER_ONLY_CONFIG_KEYS"),
      rbacSrc.indexOf("GUARDRAIL_KM_KEYS = new Set"),
    );
    expect(ownerBlock).toContain("'ride_vertical_enabled'");
  });

  it("lib/platformConfig.ts reuses isVerticalEnabled (no new query path)", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/platformConfig.ts"), "utf8");
    expect(src).toContain("RIDE_VERTICAL_ENABLED_KEY");
    const wrapper = src.slice(src.indexOf("export function isRideVerticalEnabled"));
    expect(wrapper).toContain("return isVerticalEnabled(RIDE_VERTICAL_ENABLED_KEY)");
  });
});
