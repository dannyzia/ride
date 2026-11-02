/**
 * Plan 28 Stage 3 (ISSUE-87) — utils-server telematics ingestion & flush.
 *
 * Covers: activeTrips lifecycle, breadcrumb decimation at 1,000 points,
 * getLastPoint, flushAndEvictRoute calculation + SQL concatenation shape,
 * and scheduler Job 61 (30-day ride_routes purge with SOS / fare-dispute
 * safety holds).
 *
 * The Job 61 section reuses the scheduler tick-capture harness from
 * scheduler-job51-delivery-ttl.test.ts: ALL interval callbacks are captured
 * via a spied setInterval and executed; the purge tick is identified by the
 * DELETE it issues (table identity, not registration order).
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../lib/safety", () => ({ detectStationaryAnomaly: jest.fn(), detectRouteDeviation: jest.fn() }));
jest.mock("../../lib/time", () => ({
  nextBdtMidnightUtc: jest.fn(() => new Date()),
  bdtDayOfWeek: jest.fn(() => 1),
  bdtHourOfDay: jest.fn(() => 0),
}));
jest.mock("../../lib/zoneBudget", () => ({ resetAllBudgets: jest.fn() }));
jest.mock("../../lib/zoneLifecycle", () => ({ evaluateGraduation: jest.fn() }));
jest.mock("../../lib/walletCashback", () => ({ expireCredits: jest.fn(), expireRiderFeeDeductions: jest.fn() }));
jest.mock("../../lib/fraudDetection", () => ({ runFraudDetection: jest.fn() }));
jest.mock("../../lib/cancellationCompensation", () => ({ expireCancellationCredits: jest.fn() }));
jest.mock("../../lib/notify", () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
  sendNotifications: jest.fn(async () => ({ sent: 0, failed: 0 })),
}));
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Int: jest.fn(async (_k: string, f: number) => f),
  getConfigValue: jest.fn(async (_k: string, f: string | null) => f),
  getConfigInt: jest.fn(async (_k: string, f: number) => f),
  requireConfigInt: jest.fn(async () => 7),
}));
jest.mock("../../lib/forecast", () => ({ upsertDemandForecasts: jest.fn() }));
jest.mock("../../lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async (keys: readonly string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = "";
    return out;
  }),
  parseConfigNumber: (value: string, fallback: number) => {
    if (value == null || String(value).trim() === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },
  parseConfigBool: (value: string) => value === "true",
  parseConfigCsv: (value: string) => String(value).split(",").map((s) => s.trim()).filter(Boolean),
}));
jest.mock("../../lib/zoneRecovery", () => ({ computeZoneRecoveries: jest.fn(async () => []) }));
jest.mock("../rentalDispatchChain", () => ({
  sweepDeadlines: jest.fn(async () => 0),
  sweepAssignmentSla: jest.fn(async () => 0),
  sweepConfirmationDeadlines: jest.fn(async () => 0),
}));
jest.mock("../deliveryHandler", () => ({ sweepStaleCouriers: jest.fn(async () => 0) }));
jest.mock("../activationJobs", () => ({
  activateRentalRequests: jest.fn(async () => ({ count: 0, notifyQueue: [] })),
  dispatchNotifyQueue: jest.fn(async () => undefined),
}));
jest.mock("../emergencyChain", () => ({ sweepExpiredEmergencies: jest.fn(async () => 0) }));
jest.mock("../emergencyActivation", () => ({ activateEmergencyRequests: jest.fn(async () => 0) }));
jest.mock("../../lib/notifications/server", () => ({ sweepExpiredNotifications: jest.fn(async () => 0) }));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../../src/db";
import { rideRoutes } from "../../src/db/schema";
import {
  registerActiveTrip,
  updateActiveTripStatus,
  getActiveTrip,
  unregisterActiveTrip,
  clearActiveTrips,
} from "../activeTrips";
import {
  recordBreadcrumbPoint,
  getLastPoint,
  evictActiveRoute,
  flushAndEvictRoute,
  flushAllActiveRoutes,
  clearRouteBuffers,
  getBufferedRouteCount,
  summarizeRoutePoints,
  MAX_BUFFER_POINTS,
  type BreadcrumbPoint,
} from "../breadcrumbs";
import { startScheduler } from "../scheduler";

type Row = Record<string, unknown>;
type TickFn = () => Promise<void>;

const RIDE_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";

function point(i: number): BreadcrumbPoint {
  return { lat: 23.81 + i * 0.0001, lng: 90.41 + i * 0.0001, ts: 1_000_000 + i * 1000 };
}

function resetDbMock(): void {
  (db.select as jest.Mock).mockReset().mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => [],
        orderBy: () => ({ limit: async () => [] }),
      }),
    }),
  }));
  (db.insert as jest.Mock).mockReset().mockImplementation((_table: unknown) => ({
    values: () => ({
      returning: async () => [],
      onConflictDoNothing: () => Promise.resolve([]),
      onConflictDoUpdate: () => Promise.resolve([]),
    }),
  }));
  (db.update as jest.Mock).mockReset().mockImplementation(() => ({
    set: () => ({ where: () => ({ returning: async () => [] }), returning: async () => [] }),
  }));
  (db.delete as jest.Mock).mockReset().mockImplementation(() => ({
    where: async () => [],
  }));
  (db.execute as jest.Mock).mockReset().mockResolvedValue([]);
  (db.transaction as jest.Mock).mockReset().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
}

beforeEach(() => {
  resetDbMock();
  jest.clearAllMocks();
  clearActiveTrips();
  clearRouteBuffers();
});

describe("activeTrips lifecycle", () => {
  test("register stores the trip and getActiveTrip returns it", () => {
    registerActiveTrip(RIDE_ID, {
      driverId: DRIVER_ID,
      status: "matched",
      originLat: 23.81,
      originLng: 90.41,
      destLat: 23.82,
      destLng: 90.42,
    });
    expect(getActiveTrip(RIDE_ID)).toEqual({
      driverId: DRIVER_ID,
      status: "matched",
      originLat: 23.81,
      originLng: 90.41,
      destLat: 23.82,
      destLng: 90.42,
    });
  });

  test("updateActiveTripStatus advances status; no-op on unknown ride", () => {
    registerActiveTrip(RIDE_ID, {
      driverId: DRIVER_ID,
      status: "matched",
      originLat: 0,
      originLng: 0,
      destLat: 0,
      destLng: 0,
    });
    updateActiveTripStatus(RIDE_ID, "in_progress");
    expect(getActiveTrip(RIDE_ID)?.status).toBe("in_progress");
    expect(() => updateActiveTripStatus("no-such-ride", "in_progress")).not.toThrow();
    expect(getActiveTrip("no-such-ride")).toBeUndefined();
  });

  test("unregister removes the trip; re-register overwrites", () => {
    registerActiveTrip(RIDE_ID, {
      driverId: DRIVER_ID,
      status: "matched",
      originLat: 0,
      originLng: 0,
      destLat: 0,
      destLng: 0,
    });
    unregisterActiveTrip(RIDE_ID);
    expect(getActiveTrip(RIDE_ID)).toBeUndefined();
    registerActiveTrip(RIDE_ID, {
      driverId: "other-driver",
      status: "driver_arrived",
      originLat: 1,
      originLng: 2,
      destLat: 3,
      destLng: 4,
    });
    expect(getActiveTrip(RIDE_ID)?.driverId).toBe("other-driver");
  });
});

describe("recordBreadcrumbPoint decimation", () => {
  test(`buffer halves to even indices at ${MAX_BUFFER_POINTS} points`, () => {
    expect(MAX_BUFFER_POINTS).toBe(1000);
    for (let i = 0; i < 1000; i++) recordBreadcrumbPoint(RIDE_ID, point(i));
    // 1000 even indices survive; odds are dropped. Last survivor is idx 998.
    expect(getBufferedRouteCount(RIDE_ID)).toBe(500);
    expect(getLastPoint(RIDE_ID)?.lat).toBe(point(998).lat);
    // One more point appends without another decimation.
    recordBreadcrumbPoint(RIDE_ID, point(1000));
    expect(getBufferedRouteCount(RIDE_ID)).toBe(501);
    expect(getLastPoint(RIDE_ID)?.lat).toBe(point(1000).lat);
  });

  test("buffers are per-ride and evictActiveRoute drops without persisting", () => {
    recordBreadcrumbPoint(RIDE_ID, point(0));
    recordBreadcrumbPoint("other-ride", point(1));
    evictActiveRoute(RIDE_ID);
    expect(getLastPoint(RIDE_ID)).toBeNull();
    expect(getBufferedRouteCount(RIDE_ID)).toBe(0);
    expect(getLastPoint("other-ride")?.lat).toBe(point(1).lat);
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("getLastPoint returns null for untracked rides", () => {
    expect(getLastPoint("never-tracked")).toBeNull();
  });
});

describe("summarizeRoutePoints", () => {
  test("empty and single-point buffers summarize to zero", () => {
    expect(summarizeRoutePoints([])).toEqual({ distanceMeters: 0, durationSec: 0 });
    expect(summarizeRoutePoints([point(0)])).toEqual({ distanceMeters: 0, durationSec: 0 });
  });

  test("distance sums haversine segments; duration spans first to last", () => {
    // 0.01 deg latitude ≈ 1111.95 m; 60 s span.
    const pts = [
      { lat: 23.81, lng: 90.41, ts: 1_000_000 },
      { lat: 23.82, lng: 90.41, ts: 1_060_000 },
    ];
    const { distanceMeters, durationSec } = summarizeRoutePoints(pts);
    expect(Math.abs(distanceMeters - 1111.95)).toBeLessThan(1);
    expect(durationSec).toBe(60);
  });

  test("negative clock skew clamps duration to zero", () => {
    const pts = [
      { lat: 23.81, lng: 90.41, ts: 2_000_000 },
      { lat: 23.82, lng: 90.41, ts: 1_000_000 },
    ];
    expect(summarizeRoutePoints(pts).durationSec).toBe(0);
  });
});

describe("flushAndEvictRoute", () => {
  function captureInsert(): { table: unknown; vals: Row; conflict: Row } {
    const captured = { table: undefined as unknown, vals: {} as Row, conflict: {} as Row };
    (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
      values: (vals: Row) => {
        captured.table = table;
        captured.vals = vals;
        return {
          onConflictDoUpdate: (conflict: Row) => {
            captured.conflict = conflict;
            return Promise.resolve([]);
          },
        };
      },
    }));
    return captured;
  }

  test("empty buffer returns false and never touches the db", async () => {
    await expect(flushAndEvictRoute("nothing-buffered")).resolves.toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("writes the row, concatenates on conflict, then evicts", async () => {
    const captured = captureInsert();
    for (let i = 0; i < 1000; i++) recordBreadcrumbPoint(RIDE_ID, point(i));
    await expect(flushAndEvictRoute(RIDE_ID)).resolves.toBe(true);

    // Decimated payload: 500 even-index points, trajectory endpoints kept.
    expect(captured.table).toBe(rideRoutes);
    expect(captured.vals.ride_id).toBe(RIDE_ID);
    expect((captured.vals.points as Row[])).toHaveLength(500);
    expect(((captured.vals.points as Row[])[0] as Row).lat).toBe(point(0).lat);
    expect(((captured.vals.points as Row[])[499] as Row).lat).toBe(point(998).lat);
    expect(typeof captured.vals.distance_meters).toBe("string");
    expect(typeof captured.vals.duration_seconds).toBe("number");

    // Crash-safe SQL shape: append (not overwrite), max duration, accumulate.
    const setClause = captured.conflict.set as Row;
    expect((captured.conflict.target as { name?: string }).name).toBe("ride_id");
    const pointsSql = new PgDialect().sqlToQuery(setClause.points as never);
    expect(pointsSql.sql).toContain("COALESCE");
    expect(pointsSql.sql).toContain("||");
    expect(pointsSql.sql).toContain("'[]'::jsonb");
    const flushedPayload = JSON.parse(pointsSql.params[0] as string) as Row[];
    expect(flushedPayload).toHaveLength(500);
    expect(flushedPayload[0].lat).toBe(point(0).lat);
    const durationSql = new PgDialect().sqlToQuery(setClause.duration_seconds as never);
    expect(durationSql.sql).toContain("GREATEST");
    const distanceSql = new PgDialect().sqlToQuery(setClause.distance_meters as never);
    expect(distanceSql.sql).toContain("COALESCE");
    expect(distanceSql.sql).toContain("+");

    // Evicted: a second flush finds nothing.
    expect(getBufferedRouteCount(RIDE_ID)).toBe(0);
    await expect(flushAndEvictRoute(RIDE_ID)).resolves.toBe(false);
  });

  test("db failure keeps the buffer for retry and returns false", async () => {
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: () => ({
        onConflictDoUpdate: () => Promise.reject(new Error("db down")),
      }),
    }));
    recordBreadcrumbPoint(RIDE_ID, point(0));
    await expect(flushAndEvictRoute(RIDE_ID)).resolves.toBe(false);
    expect(getBufferedRouteCount(RIDE_ID)).toBe(1);
  });

  test("flushAllActiveRoutes flushes every buffer and reports counts", async () => {
    captureInsert();
    recordBreadcrumbPoint(RIDE_ID, point(0));
    recordBreadcrumbPoint("ride-b", point(1));
    await expect(flushAllActiveRoutes()).resolves.toEqual({ flushed: 2, failed: 0 });
    expect(getBufferedRouteCount(RIDE_ID)).toBe(0);
    expect(getBufferedRouteCount("ride-b")).toBe(0);
  });
});

describe("scheduler job 61 — ride_routes 30-day purge", () => {
  /** Capture ALL registered ticks; schedule nothing. */
  function captureTicks(): Array<{ fn: TickFn; ms: number }> {
    const ticks: Array<{ fn: TickFn; ms: number }> = [];
    const spy = jest
      .spyOn(global, "setInterval")
      .mockImplementation(((fn: TickFn, ms: number) => {
        ticks.push({ fn, ms });
        return 0 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval);
    try {
      startScheduler();
    } finally {
      spy.mockRestore();
    }
    expect(ticks.length).toBeGreaterThanOrEqual(50);
    return ticks;
  }

  test("exactly one tick deletes ride_routes older than 30 days (LIMIT 1000)", async () => {
    const executed: string[] = [];
    (db.execute as jest.Mock).mockImplementation((q: { toString?: () => string }) => {
      try {
        const rendered = new PgDialect().sqlToQuery(q as never);
        executed.push(rendered.sql);
      } catch {
        executed.push("");
      }
      return Promise.resolve([]);
    });
    const ticks = captureTicks();
    for (const { fn } of ticks) {
      await fn();
    }
    const purges = executed.filter((s) => s.includes("ride_routes") && s.includes("DELETE"));
    expect(purges).toHaveLength(1);
    const purge = purges[0];
    // Bounded retention window.
    expect(purge).toContain("interval '30 days'");
    expect(purge).toContain("LIMIT 1000");
    // Safety holds: SOS evidence and unresolved fare disputes are never purged.
    expect(purge).toContain("sos_alerts");
    expect(purge).toContain("NOT EXISTS");
    expect(purge).toContain("fare_disputes");
    expect(purge).toContain("'resolved'");
  });

  test("purge tick registers on the daily interval", async () => {
    const executed: string[] = [];
    (db.execute as jest.Mock).mockImplementation((q: { toString?: () => string }) => {
      try {
        executed.push(new PgDialect().sqlToQuery(q as never).sql);
      } catch {
        executed.push("");
      }
      return Promise.resolve([]);
    });
    const ticks = captureTicks();
    let purgeMs: number | undefined;
    for (const { fn, ms } of ticks) {
      executed.length = 0;
      await fn();
      if (executed.some((s) => s.includes("ride_routes") && s.includes("DELETE"))) {
        purgeMs = ms;
        break;
      }
    }
    expect(purgeMs).toBe(86_400_000);
  });
});
