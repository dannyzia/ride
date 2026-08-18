import { polygonCentroid } from '../polygon';

describe('polygonCentroid', () => {
  it('returns the center of a square', () => {
    const square = [
      { lat: 23.7, lng: 90.3 },
      { lat: 23.7, lng: 90.5 },
      { lat: 23.9, lng: 90.5 },
      { lat: 23.9, lng: 90.3 },
    ];
    const c = polygonCentroid(square);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(23.8, 6);
    expect(c!.lng).toBeCloseTo(90.4, 6);
  });

  it('returns a single point as-is', () => {
    const c = polygonCentroid([{ lat: 23.81, lng: 90.41 }]);
    expect(c).toEqual({ lat: 23.81, lng: 90.41 });
  });

  it('returns null for empty input', () => {
    expect(polygonCentroid([])).toBeNull();
    expect(polygonCentroid(null as never)).toBeNull();
  });

  it('falls back to vertex average for a degenerate ring', () => {
    // Collinear ring — shoelace area is zero.
    const line = [
      { lat: 23.7, lng: 90.3 },
      { lat: 23.8, lng: 90.4 },
      { lat: 23.9, lng: 90.5 },
    ];
    const c = polygonCentroid(line);
    expect(c!.lat).toBeCloseTo(23.8, 6);
    expect(c!.lng).toBeCloseTo(90.4, 6);
  });
});
