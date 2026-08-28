import {
  haversineKm,
  nearestHotspot,
  demandLevel,
  type HotspotPoint,
} from '../hotspots';

describe('haversineKm', () => {
  it('is ~111.2 km per degree of latitude', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.195, 2);
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.195, 2);
  });

  it('is 0 for identical points and symmetric', () => {
    expect(haversineKm(23.8, 90.4, 23.8, 90.4)).toBe(0);
    expect(haversineKm(23.8, 90.4, 23.7, 90.3)).toBeCloseTo(
      haversineKm(23.7, 90.3, 23.8, 90.4),
      9,
    );
  });
});

describe('nearestHotspot', () => {
  const zones: HotspotPoint[] = [
    { name: 'far', lat: 23.9, lng: 90.5, intensity: 0.9, intensity_raw: 0.9, demand_count: 9, supply_count: 3 },
    { name: 'near', lat: 23.82, lng: 90.41, intensity: 0.6, intensity_raw: 0.6, demand_count: 6, supply_count: 4 },
    { name: 'middle', lat: 23.85, lng: 90.43, intensity: 0.4, intensity_raw: 0.4, demand_count: 4, supply_count: 6 },
  ];

  it('picks the closest zone to the coordinate', () => {
    expect(nearestHotspot(zones, 23.81, 90.4)!.name).toBe('near');
  });

  it('returns null for an empty list', () => {
    expect(nearestHotspot([], 23.81, 90.4)).toBeNull();
  });

  it('is unaffected by list order', () => {
    const shuffled = [zones[2], zones[0], zones[1]];
    expect(nearestHotspot(shuffled, 23.81, 90.4)!.name).toBe('near');
  });
});

describe('demandLevel', () => {
  it('is low below 0.33', () => {
    expect(demandLevel(0)).toBe('low');
    expect(demandLevel(0.32)).toBe('low');
  });

  it('is medium from 0.33 up to 0.66', () => {
    expect(demandLevel(0.33)).toBe('medium');
    expect(demandLevel(0.65)).toBe('medium');
  });

  it('is high at 0.66 and above', () => {
    expect(demandLevel(0.66)).toBe('high');
    expect(demandLevel(1)).toBe('high');
  });

  it('is anchored to absolute demand/supply ratios, not relative rank', () => {
    expect(demandLevel(2 / 3)).toBe('high');
    expect(demandLevel(0.5)).toBe('medium');
    expect(demandLevel(1 / 3)).toBe('medium');
    expect(demandLevel(0.25)).toBe('low');
  });
});
