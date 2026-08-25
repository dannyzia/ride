/**
 * Trace accumulation tests (Phase F quote state 3 + Phase G ring buffer):
 *  - teleport filter (ruling 6): segments implying speed > threshold dropped
 *  - realized_km = Σ haversine over ACCEPTED consecutive segments
 *  - confidence = acceptedSegments / totalSegments (0 when none)
 *  - 30-minute ring buffer cap
 *  - register / finalize / unregister lifecycle
 */

import {
  registerRideTrace,
  recordDriverPoint,
  finalizeRideTrace,
  unregisterRideTrace,
  getActiveTraceRideId,
  appendDriverRingPoint,
  getDriverPointsInWindow,
  getLastDriverPoint,
  segmentSpeedKmh,
  parsePointTs,
  clearRideTraces,
  clearDriverRingBuffer,
  RING_BUFFER_WINDOW_MS,
} from "../trace";

beforeEach(() => {
  clearRideTraces();
  clearDriverRingBuffer();
});

// ~0.01° latitude ≈ 1.112 km (R = 6371 km)
const DEG_LAT_KM = 111.195;

describe("teleport filter (ruling 6)", () => {
  test("segment implying speed > threshold is dropped from the accepted chain", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", 23.0, 90.0, 0); // anchor, always accepted
    recordDriverPoint("d1", 23.0, 90.0018, 60_000); // ~200 m in 60 s → ~12 km/h: OK
    recordDriverPoint("d1", 23.01, 90.0, 60_500); // ~1.1 km in 0.5 s: teleport
    recordDriverPoint("d1", 23.0, 90.0036, 120_000); // ~400 m from anchor in 60 s: OK

    const result = finalizeRideTrace("ride-1")!;
    // 3 segment attempts total; 2 accepted (teleport point rejected).
    expect(result.confidence).toBeCloseTo(2 / 3, 5);
    // realized excludes the teleport jump: anchor → p2 → p4 haversine chain.
    const p2ToP4Km = Math.hypot(23.0 - 23.0, 0.0036 - 0.0018) * DEG_LAT_KM;
    expect(result.realizedKm).toBeGreaterThan(0.15); // ≈ 200 m + ~p2→p4
    expect(result.realizedKm).toBeLessThan(p2ToP4Km + 0.25);
  });

  test("drop does not break chain continuity — next point compares vs last ACCEPTED", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", 23.0, 90.0, 0);
    recordDriverPoint("d1", 23.5, 90.0, 1_000); // ~55 km in 1 s → dropped
    // 300 m from the ANCHOR (not from the dropped point) in 60 s → accepted
    recordDriverPoint("d1", 23.0, 90.0027, 61_000);

    const result = finalizeRideTrace("ride-1")!;
    expect(result.confidence).toBeCloseTo(1 / 2, 5);
    // realized ≈ 300 m (anchor → final), NOT 55 km.
    expect(result.realizedKm).toBeLessThan(0.35);
    expect(result.realizedKm).toBeGreaterThan(0.25);
  });
});

describe("realized_km and confidence", () => {
  test("realized = Σ haversine over accepted consecutive segments", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", 23.0, 90.0, 0);
    recordDriverPoint("d1", 23.01, 90.0, 60_000); // ~1.11 km, 67 km/h: OK
    recordDriverPoint("d1", 23.01, 90.01, 120_000); // ~1.02 km at lat 23: OK

    const result = finalizeRideTrace("ride-1")!;
    // 0.01° lat ≈ 1.1119 km + 0.01° lng at 23° ≈ 1.1119 × cos(23°) ≈ 1.0246 km
    expect(result.realizedKm).toBeCloseTo(1.1119 + 1.0246, 2);
    expect(result.confidence).toBe(1); // all 2 segments accepted
  });

  test("fewer than 2 points → confidence 0, realized 0", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", 23.0, 90.0, 0);

    const result = finalizeRideTrace("ride-1")!;
    expect(result.realizedKm).toBe(0);
    expect(result.confidence).toBe(0);
  });

  test("seed point anchors the trace (accepted, counts once)", () => {
    registerRideTrace("ride-1", "d1", 80, { lat: 23.0, lng: 90.0, at: 0 });
    recordDriverPoint("d1", 23.009, 90.0, 60_000); // ~1 km north in 60 s: OK

    const result = finalizeRideTrace("ride-1")!;
    expect(result.confidence).toBe(1);
    expect(result.realizedKm).toBeGreaterThan(0.95);
    expect(result.realizedKm).toBeLessThan(1.05);
  });
});

describe("lifecycle", () => {
  test("only the traced driver's points accumulate; finalize unregisters", () => {
    registerRideTrace("ride-1", "d1", 80);
    expect(getActiveTraceRideId("d1")).toBe("ride-1");
    expect(getActiveTraceRideId("d2")).toBeNull();

    recordDriverPoint("d2", 23.5, 90.5, 0); // other driver: ring buffer only
    recordDriverPoint("d1", 23.0, 90.0, 0);
    recordDriverPoint("d1", 23.001, 90.0, 30_000);

    expect(finalizeRideTrace("ride-1")).not.toBeNull();
    expect(getActiveTraceRideId("d1")).toBeNull();
    expect(finalizeRideTrace("ride-1")).toBeNull(); // second finalize: no-op
  });

  test("unregister drops the trace without a result", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", 23.0, 90.0, 0);
    expect(unregisterRideTrace("ride-1")).toBe(true);
    expect(finalizeRideTrace("ride-1")).toBeNull();
    expect(unregisterRideTrace("ride-1")).toBe(false);
  });

  test("registering the same ride twice is a no-op (first wins)", () => {
    registerRideTrace("ride-1", "d1", 80);
    registerRideTrace("ride-1", "d1", 200);
    recordDriverPoint("d1", 23.5, 90.0, 0); // ~55 km instant → dropped at 80
    recordDriverPoint("d1", 23.0, 90.0, 0);
    const result = finalizeRideTrace("ride-1")!;
    expect(result.confidence).toBe(0); // the only real segment was rejected
  });
});

describe("driver GPS ring buffer (Phase G)", () => {
  test("capped to the 30-minute window", () => {
    const now = 1_000_000_000_000;
    appendDriverRingPoint("d1", 23.0, 90.0, now - RING_BUFFER_WINDOW_MS - 5_000); // too old
    appendDriverRingPoint("d1", 23.0, 90.0, now - RING_BUFFER_WINDOW_MS); // boundary, kept
    appendDriverRingPoint("d1", 23.001, 90.0, now - 60_000);
    appendDriverRingPoint("d1", 23.002, 90.0, now);

    const inWindow = getDriverPointsInWindow("d1", 0, Number.MAX_SAFE_INTEGER);
    expect(inWindow).toHaveLength(3);
    expect(inWindow[0].at).toBe(now - RING_BUFFER_WINDOW_MS);
    expect(getLastDriverPoint("d1")).toEqual({ lat: 23.002, lng: 90.0, at: now });
  });

  test("window query bounds are inclusive", () => {
    appendDriverRingPoint("d1", 23.0, 90.0, 1_000);
    appendDriverRingPoint("d1", 23.0, 90.0, 2_000);
    appendDriverRingPoint("d1", 23.0, 90.0, 3_000);
    expect(getDriverPointsInWindow("d1", 1_000, 2_000)).toHaveLength(2);
    expect(getDriverPointsInWindow("d1", 3_001, 9_999)).toHaveLength(0);
    expect(getDriverPointsInWindow("nobody", 0, 9_999)).toHaveLength(0);
  });

  test("recordDriverPoint feeds both ring buffer and active trace", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", 23.0, 90.0, 5_000);
    expect(getLastDriverPoint("d1")).toEqual({ lat: 23.0, lng: 90.0, at: 5_000 });
    expect(finalizeRideTrace("ride-1")).not.toBeNull();
    // ring buffer entry survives trace finalization
    expect(getLastDriverPoint("d1")).not.toBeNull();
  });

  test("non-finite coordinates are ignored", () => {
    registerRideTrace("ride-1", "d1", 80);
    recordDriverPoint("d1", NaN, 90.0, 0);
    recordDriverPoint("d1", 23.0, Infinity, 0);
    expect(finalizeRideTrace("ride-1")!.confidence).toBe(0);
    expect(getLastDriverPoint("d1")).toBeNull();
  });
});

describe("segmentSpeedKmh / parsePointTs", () => {
  test("non-positive dt: movement → Infinity, no movement → 0", () => {
    const a = { lat: 23.0, lng: 90.0, at: 1_000 };
    expect(segmentSpeedKmh(a, { lat: 23.001, lng: 90.0, at: 1_000 })).toBe(Infinity);
    expect(segmentSpeedKmh(a, { ...a, at: 500 })).toBe(0);
  });

  test("parsePointTs accepts epoch ms and ISO strings, falls back to now", () => {
    expect(parsePointTs(1_234)).toBe(1_234);
    expect(parsePointTs("2026-08-25T00:00:00Z")).toBe(Date.parse("2026-08-25T00:00:00Z"));
    const before = Date.now();
    expect(parsePointTs("garbage")).toBeGreaterThanOrEqual(before);
    expect(parsePointTs(undefined)).toBeGreaterThanOrEqual(before);
  });
});
