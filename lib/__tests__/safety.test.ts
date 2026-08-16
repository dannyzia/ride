/**
 * T-2 regression: deviation must be measured from the pickup→dropoff CORRIDOR,
 * not from the destination. The old metric (distance from dropoff) exceeded
 * any threshold for virtually every healthy ride and fired on every ping.
 *
 * These tests pin the geometry of distanceToSegmentMeters — the perpendicular
 * distance from the driver's position to the origin→destination segment.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));

import { distanceToSegmentMeters } from "../safety";

// Dhaka-scale coordinates (approximate). Origin: Gulshan, Dest: Dhanmondi.
const ORIGIN = { lat: 23.7937, lng: 90.4066 };
const DEST = { lat: 23.7461, lng: 90.3756 };

describe("distanceToSegmentMeters — corridor deviation metric (T-2)", () => {
  test("a point exactly ON the segment measures ~0m", () => {
    // Midpoint of origin→dest lies on the segment.
    const mid = {
      lat: (ORIGIN.lat + DEST.lat) / 2,
      lng: (ORIGIN.lng + DEST.lng) / 2,
    };
    const d = distanceToSegmentMeters(mid.lat, mid.lng, ORIGIN.lat, ORIGIN.lng, DEST.lat, DEST.lng);
    expect(d).toBeLessThan(10); // ~0m (equirectangular approx)
  });

  test("the origin itself measures ~0m (ride start is never a deviation)", () => {
    const d = distanceToSegmentMeters(ORIGIN.lat, ORIGIN.lng, ORIGIN.lat, ORIGIN.lng, DEST.lat, DEST.lng);
    expect(d).toBeLessThan(10);
  });

  test("a point far off the corridor exceeds the 500m threshold", () => {
    // ~2.5km off the corridor line (perpendicular offset of ~0.02 deg lat).
    const off = { lat: ORIGIN.lat + 0.022, lng: (ORIGIN.lng + DEST.lng) / 2 };
    const d = distanceToSegmentMeters(off.lat, off.lng, ORIGIN.lat, ORIGIN.lng, DEST.lat, DEST.lng);
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(4000);
  });

  test("points beyond the segment ends clamp to the nearest endpoint (not the infinite line)", () => {
    // 0.2× past the destination along the same bearing — must measure
    // distance to DEST (≈1.2km), not to the infinite line (which would be ~0).
    const beyond = {
      lat: DEST.lat + 0.2 * (DEST.lat - ORIGIN.lat),
      lng: DEST.lng + 0.2 * (DEST.lng - ORIGIN.lng),
    };
    const d = distanceToSegmentMeters(beyond.lat, beyond.lng, ORIGIN.lat, ORIGIN.lng, DEST.lat, DEST.lng);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(3000);
  });
});
