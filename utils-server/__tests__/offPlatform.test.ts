/**
 * Off-platform completion detection tests (Phase G): corridor matching
 * (point-to-segment), 300 m pickup exclusion, overlap share, 5-minute
 * blind window, and the minimum-qualifying-points gate.
 */

import {
  pointToSegmentDistanceM,
  isWithinCorridorM,
  computeOverlap,
  pointsInDetectionWindow,
  PICKUP_EXCLUSION_RADIUS_M,
  CORRIDOR_WIDTH_M,
  MIN_QUALIFYING_POINTS,
} from "../offPlatform";
import type { TracePoint } from "../trace";

// Dhaka-area synthetic geometry: 0.01° lng at lat 23 ≈ 1024.7 m;
// 0.01° lat ≈ 1113 m.
const PICKUP = { lat: 23.0, lng: 90.0 };
const CORRIDOR = [
  { lat: 23.0, lng: 90.0 },
  { lat: 23.0, lng: 90.05 },
];

function pt(lat: number, lng: number, at: number): TracePoint {
  return { lat, lng, at };
}

describe("pointToSegmentDistanceM", () => {
  const a = { lat: 23.0, lng: 90.0 };
  const b = { lat: 23.0, lng: 90.05 };

  test("point on the segment → ~0", () => {
    expect(pointToSegmentDistanceM({ lat: 23.0, lng: 90.025 }, a, b)).toBeLessThan(1);
  });

  test("perpendicular offset ≈ offset in metres", () => {
    // 0.001° lat ≈ 111.3 m off the corridor line
    expect(pointToSegmentDistanceM({ lat: 23.001, lng: 90.025 }, a, b)).toBeCloseTo(111, -1);
    // 0.003° lat ≈ 334 m
    expect(pointToSegmentDistanceM({ lat: 23.003, lng: 90.025 }, a, b)).toBeCloseTo(334, -1);
  });

  test("beyond the segment end → distance to the endpoint", () => {
    // 0.01° lng behind `a` ≈ 1024.7 m
    expect(pointToSegmentDistanceM({ lat: 23.0, lng: 89.99 }, a, b)).toBeCloseTo(1025, -1);
  });

  test("degenerate segment (a == b) → point distance", () => {
    expect(pointToSegmentDistanceM({ lat: 23.01, lng: 90.0 }, a, a)).toBeCloseTo(1112, -1);
  });
});

describe("isWithinCorridorM", () => {
  test("150 m corridor membership", () => {
    expect(isWithinCorridorM({ lat: 23.0, lng: 90.03 }, CORRIDOR, CORRIDOR_WIDTH_M)).toBe(true);
    expect(isWithinCorridorM({ lat: 23.001, lng: 90.03 }, CORRIDOR, CORRIDOR_WIDTH_M)).toBe(true);
    expect(isWithinCorridorM({ lat: 23.002, lng: 90.03 }, CORRIDOR, CORRIDOR_WIDTH_M)).toBe(false);
    expect(isWithinCorridorM({ lat: 23.5, lng: 90.5 }, CORRIDOR, CORRIDOR_WIDTH_M)).toBe(false);
  });

  test("fewer than 2 legs → false", () => {
    expect(isWithinCorridorM(PICKUP, [PICKUP], CORRIDOR_WIDTH_M)).toBe(false);
  });
});

describe("computeOverlap — 300 m pickup exclusion + corridor share", () => {
  test("points within 300 m of the pickup never qualify (approach path)", () => {
    // ~223 m from pickup — would otherwise sit on the corridor
    const near = pt(23.002, 90.0, 0);
    const res = computeOverlap([near], PICKUP, CORRIDOR);
    expect(res.qualifying).toBe(0);
    expect(res.matched).toBe(0);
    expect(res.overlapPct).toBe(0);
  });

  test("qualify + match mix produces the correct share", () => {
    const points = [
      pt(23.002, 90.0, 0), // 223 m from pickup → excluded
      pt(23.0, 90.03, 0), // on corridor, far from pickup → qualify + match
      pt(23.001, 90.04, 0), // 111 m off corridor → qualify + match
      pt(23.0, 90.05, 0), // corridor end → qualify + match
      pt(23.02, 90.03, 0), // 2.2 km off corridor → qualify, no match
      pt(23.004, 90.0, 0), // 445 m from pickup, 445 m off corridor → qualify, no match
    ];
    const res = computeOverlap(points, PICKUP, CORRIDOR);
    expect(res.qualifying).toBe(5);
    expect(res.matched).toBe(3);
    expect(res.overlapPct).toBe(60);
  });

  test("empty points → 0", () => {
    const res = computeOverlap([], PICKUP, CORRIDOR);
    expect(res).toEqual({ qualifying: 0, matched: 0, overlapPct: 0 });
  });

  test("all matching → 100", () => {
    const points = [
      pt(23.0, 90.03, 0),
      pt(23.0005, 90.04, 0),
    ];
    expect(computeOverlap(points, PICKUP, CORRIDOR).overlapPct).toBe(100);
  });
});

describe("pointsInDetectionWindow — [cancel+5min, cancel+30min]", () => {
  const CANCEL = 1_000_000_000_000;
  const MIN = 60_000;

  test("5-minute blind window excludes the approach path", () => {
    const points = [
      pt(23.0, 90.03, CANCEL + 1 * MIN), // inside blind window → excluded
      pt(23.0, 90.03, CANCEL + 5 * MIN), // boundary start → included
      pt(23.0, 90.03, CANCEL + 29 * MIN), // included
      pt(23.0, 90.03, CANCEL + 30 * MIN), // boundary end → included
      pt(23.0, 90.03, CANCEL + 31 * MIN), // past the window → excluded
    ];
    const inWindow = pointsInDetectionWindow(points, CANCEL);
    expect(inWindow.map((p) => p.at)).toEqual([
      CANCEL + 5 * MIN,
      CANCEL + 29 * MIN,
      CANCEL + 30 * MIN,
    ]);
  });

  test("pre-cancel points are excluded entirely", () => {
    const points = [pt(23.0, 90.03, CANCEL - 10 * MIN)];
    expect(pointsInDetectionWindow(points, CANCEL)).toHaveLength(0);
  });
});

describe("detection gates", () => {
  test("MIN_QUALIFYING_POINTS is 5 and exclusion radius is 300 m", () => {
    expect(MIN_QUALIFYING_POINTS).toBe(5);
    expect(PICKUP_EXCLUSION_RADIUS_M).toBe(300);
    expect(CORRIDOR_WIDTH_M).toBe(150);
  });
});
