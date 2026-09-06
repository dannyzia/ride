/**
 * lib/scheduleUtils — MERGED test file (2026-09-05).
 *
 * Provenance: Phase 5 (fccceaf) committed real-ETA coverage for
 * computeEstimatedDurationMinutes; the Track B P1 batch briefly replaced it
 * with a synthetic-mock version, losing the real speed-table assertions.
 * This file restores those tests verbatim and adds DB-level checkRideOverlap
 * tests (P1-15 gap-ledger item — the overlap function itself was never
 * executed against a DB before). The Phase 5 "overlap predicate logic" block
 * was arithmetic tautologies (the predicate was recomputed inside the test
 * body); the checkRideOverlap tests below supersede it by exercising the
 * real function, including the same exclusive-edge cases.
 *
 * ETA is the REAL module (requireActual + spies) so both sections assert
 * against the actual speed table.
 */
import * as eta from "../eta";
import { db } from "@/src/db";
import { computeEstimatedDurationMinutes, checkRideOverlap } from "../scheduleUtils";

jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../eta", () => {
  const actual = jest.requireActual("../eta");
  return {
    ...actual,
    etaSpeedKmh: jest.fn(actual.etaSpeedKmh),
    timeBucket: jest.fn(actual.timeBucket),
    computeEtaMinutes: jest.fn(actual.computeEtaMinutes),
  };
});

type Row = Record<string, unknown>;

function mockCandidates(rows: Row[]): void {
  (db.select as jest.Mock).mockImplementation(() => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

// ── computeEstimatedDurationMinutes — real ETA speed table (Phase 5) ─────────

describe("computeEstimatedDurationMinutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses offpeak speed when no scheduled_at provided", () => {
    // bike offpeak speed = 22 km/h
    // 10 km / 22 km/h * 60 = 27.27 → rounded to 27 min
    const result = computeEstimatedDurationMinutes(10, "bike_basic");
    expect(result).toBe(27);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith("bike_basic", "offpeak");
  });

  test("uses peak speed when scheduled_at falls in peak hours", () => {
    // Peak: 7-10 or 17-21 Dhaka time
    // Dhaka = UTC+6, so 8:00 Dhaka = 02:00 UTC
    const peakDate = new Date("2026-01-15T02:00:00Z"); // 08:00 Dhaka
    // bike peak speed = 15 km/h
    // 15 km / 15 km/h * 60 = 60 min
    const result = computeEstimatedDurationMinutes(15, "bike_standard", peakDate);
    expect(result).toBe(60);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith("bike_standard", "peak");
  });

  test("uses night speed when scheduled_at falls in night hours", () => {
    // Night: 23-5 Dhaka time. 01:00 Dhaka = 19:00 UTC (prev day)
    const nightDate = new Date("2026-01-15T19:00:00Z"); // 01:00 Dhaka
    // car_economy night speed = 20 km/h
    // 20 km / 20 km/h * 60 = 60 min
    const result = computeEstimatedDurationMinutes(20, "car_economy", nightDate);
    expect(result).toBe(60);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith("car_economy", "night");
  });

  test("minimum duration is 1 minute", () => {
    const result = computeEstimatedDurationMinutes(0.01, "bike_basic");
    expect(result).toBeGreaterThanOrEqual(1);
  });

  test("handles zero distance gracefully", () => {
    const result = computeEstimatedDurationMinutes(0, "car_comfort");
    expect(result).toBeGreaterThanOrEqual(1);
  });

  test("cng uses cng speed group", () => {
    // cng offpeak speed = 18 km/h
    // 9 km / 18 km/h * 60 = 30 min
    const result = computeEstimatedDurationMinutes(9, "cng");
    expect(result).toBe(30);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith("cng", "offpeak");
  });

  test("car_premium uses car speed group", () => {
    // car offpeak speed = 16 km/h
    // 8 km / 16 km/h * 60 = 30 min
    const result = computeEstimatedDurationMinutes(8, "car_premium");
    expect(result).toBe(30);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith("car_premium", "offpeak");
  });
});

// ── checkRideOverlap — the real function against (mocked) candidate rows ─────
// Overlap rule: existingStart < newEnd AND existingEnd > newStart — STRICT on
// both edges, so back-to-back rides with zero gap do NOT overlap.
// Durations below use the real offpeak bike_basic speed (22 km/h → 27 min per
// 10 km), keeping this section consistent with the table above.

describe("checkRideOverlap", () => {
  // 16:00 Dhaka — inside the offpeak band (peak is 7-10 / 17-21)
  const T0 = new Date("2026-09-06T10:00:00Z");
  const min = (n: number) => n * 60_000;

  const existing = (overrides: Row = {}): Row => ({
    id: "existing-1",
    status: "scheduled",
    scheduled_at: T0,
    distance_km: "10", // → 27-minute duration via the real offpeak bike table
    vehicle_type: "bike_basic",
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("no candidates → no overlap", async () => {
    mockCandidates([]);
    const result = await checkRideOverlap("user-1", T0, new Date(T0.getTime() + min(15)));
    expect(result).toEqual({ overlap: false });
  });

  test("window inside an existing ride → overlap with its id", async () => {
    mockCandidates([existing()]);
    // newStart T0+5, newEnd T0+15 — strictly inside [T0, T0+27min]
    const result = await checkRideOverlap(
      "user-1",
      new Date(T0.getTime() + min(5)),
      new Date(T0.getTime() + min(15)),
    );
    expect(result).toEqual({ overlap: true, conflict_ride_id: "existing-1" });
  });

  test("back-to-back ride (starts exactly when the existing ends) does NOT overlap", async () => {
    mockCandidates([existing()]);
    const result = await checkRideOverlap(
      "user-1",
      new Date(T0.getTime() + min(27)),
      new Date(T0.getTime() + min(40)),
    );
    expect(result).toEqual({ overlap: false });
  });

  test("non-scheduled candidates are ignored", async () => {
    mockCandidates([existing({ status: "in_progress" })]);
    const result = await checkRideOverlap(
      "user-1",
      new Date(T0.getTime() + min(2)),
      new Date(T0.getTime() + min(9)),
    );
    expect(result).toEqual({ overlap: false });
  });

  test("excludeRideId is skipped (reschedule case)", async () => {
    mockCandidates([existing()]);
    const result = await checkRideOverlap(
      "user-1",
      new Date(T0.getTime() + min(2)),
      new Date(T0.getTime() + min(9)),
      "existing-1",
    );
    expect(result).toEqual({ overlap: false });
  });

  test("candidates without scheduled_at are skipped", async () => {
    mockCandidates([existing({ scheduled_at: null })]);
    const result = await checkRideOverlap("user-1", T0, new Date(T0.getTime() + min(10)));
    expect(result).toEqual({ overlap: false });
  });

  test("first conflicting ride in order wins", async () => {
    mockCandidates([
      existing({ id: "later-conflict", scheduled_at: new Date(T0.getTime() + min(30)) }),
      existing({ id: "first-conflict" }),
    ]);
    const result = await checkRideOverlap("user-1", T0, new Date(T0.getTime() + min(10)));
    expect(result.conflict_ride_id).toBe("first-conflict");
  });
});
