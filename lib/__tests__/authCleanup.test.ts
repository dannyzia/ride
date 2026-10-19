/**
 * Sign-out teardown regression — shared by D6-FIX (client-state teardown)
 * and D2-FIX (revoke-on-logout push half).
 *
 * Runs against the REAL stores, not mocks: user A works a shift (PII
 * accumulates in every registry store) → authCleanup() → every store is
 * back at its initial state (the PII asserts as ABSENT) and the dying
 * session's token is handed to the server revoke. The registry IS the
 * coverage list — a store added without reset/clear trips the warn
 * tripwire AND the initial-state equality below.
 *
 * Ordering (audit H-1) is pinned at runtime: the socket teardown must fire
 * before any store reset, so a live socket can neither write into the
 * stores mid-reset nor survive into the next sign-in.
 */
/* eslint-disable import/first */
jest.mock("../riderSocket", () => ({
  teardownRiderSocket: jest.fn(),
}));
jest.mock("../shopSocket", () => ({
  teardownShopSocket: jest.fn(),
}));
jest.mock("../sosQueue", () => ({
  clearQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));
jest.mock("../pushRevoke", () => ({
  revokePushTokenOnSignOut: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { teardownRiderSocket } from "../riderSocket";
import { teardownShopSocket } from "../shopSocket";
import { supabase } from "../supabase";
import { revokePushTokenOnSignOut } from "../pushRevoke";
import { logger } from "../logger";
import { authCleanup, storeRegistry } from "../authCleanup";

const EXPECTED_STORES = [
  "rider",
  "driver",
  "chat",
  "driverStatus",
  "package",
  "callLedger",
  "driverFlow",
  "delivery",
  "emergency",
  "fleet",
  "rental",
  "shop",
  "rideOffer",
  "customer",
  "driverBarrel",
  "appUser",
  "rides",
  "driverDetails",
  "driverStoreBarrel",
];

/** Data-only snapshot (functions stripped) for initial-state equality. */
function dataOnly(state: object): unknown {
  return JSON.parse(
    JSON.stringify(state, (_k, v) => (typeof v === "function" ? undefined : v)),
  );
}

/** Junk value per data shape — dirt that no initial state contains. */
function dirtyFor(value: unknown): unknown {
  if (Array.isArray(value)) return ["__pii__"];
  if (value === null || value === undefined) return "__pii__";
  if (typeof value === "number") return 987654321;
  if (typeof value === "boolean") return !value;
  if (typeof value === "string") return "__pii__";
  return "__pii__"; // nested objects replaced wholesale
}

function dirtyState(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === "function") continue;
    out[k] = dirtyFor(v);
  }
  return out;
}

const flush = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  jest.clearAllMocks();
  // Start every test from pristine stores (module registry is per-file, but
  // tests within the file share it — reset first, then dirty per test).
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
  authCleanup();
  jest.clearAllMocks();
});

describe("D6-1 store registry", () => {
  it("covers every store holding per-account state (no silent gaps)", () => {
    expect(storeRegistry.map((e) => e.name).sort()).toEqual([...EXPECTED_STORES].sort());
  });

  it("H-1: socket teardown fires before any store reset", () => {
    const order: string[] = [];
    (teardownRiderSocket as jest.Mock).mockImplementation(() => void order.push("ws"));
    // Wrap each store's reset/clear to record call order (call through).
    const restore: (() => void)[] = [];
    for (const entry of storeRegistry) {
      const s = entry.getState() as Record<string, unknown>;
      const method = typeof s.reset === "function" ? "reset" : "clear";
      const orig = s[method] as (...a: unknown[]) => unknown;
      (s[method] as (...a: unknown[]) => unknown) = (...a: unknown[]) => {
        order.push(entry.name);
        return orig(...a);
      };
      restore.push(() => {
        (s[method] as (...a: unknown[]) => unknown) = orig;
      });
    }
    try {
      authCleanup();
    } finally {
      for (const r of restore) r();
    }

    expect(teardownRiderSocket).toHaveBeenCalledTimes(1);
    expect(teardownShopSocket).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("ws");
    expect(order.slice(1).sort()).toEqual([...EXPECTED_STORES].sort());
  });
});

describe("D6-1 + D2-1 shared regression: A's shift does not leak into B", () => {
  it("every store returns to initial state and the PII is gone", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: "A-token", user: { id: "user-A" } } },
    });

    // User A works a shift: PII accumulates in EVERY registry store.
    const before = new Map<string, unknown>();
    for (const entry of storeRegistry) {
      const snap = dataOnly(entry.getState() as object);
      before.set(entry.name, snap);
      entry.setState(dirtyState(entry.getState() as Record<string, unknown>));
    }
    // Sanity: the dirt actually stuck somewhere (else the test is vacuous).
    const dirtied = JSON.stringify(storeRegistry.map((e) => dataOnly(e.getState() as object)));
    expect(dirtied).toContain("__pii__");

    // Logout.
    authCleanup();
    await flush();

    // Every store is back at initial state; the PII asserts as absent.
    for (const entry of storeRegistry) {
      expect({ store: entry.name, state: dataOnly(entry.getState() as object) }).toEqual({
        store: entry.name,
        state: before.get(entry.name),
      });
    }
    const after = JSON.stringify(storeRegistry.map((e) => dataOnly(e.getState() as object)));
    expect(after).not.toContain("__pii__");
    expect(after).not.toContain("987654321");

    // No store escaped through the warn tripwire.
    expect(logger.warn).not.toHaveBeenCalled();

    // D2-1 half: the dying session's token reached the server revoke while
    // it still identified account A.
    expect(revokePushTokenOnSignOut).toHaveBeenCalledWith("A-token");
  });
});
