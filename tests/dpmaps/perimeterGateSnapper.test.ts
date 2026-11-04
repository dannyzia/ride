/**
 * tests/dpmaps/perimeterGateSnapper.test.ts
 *
 * Verifies mega-destination gate snapping:
 * 1. Snaps pin within venue radius to the nearest vehicle-legal gate.
 * 2. Cars prefer perimeter_gate; bikes/CNG accept any legal entrance.
 * 3. Generates pedestrian connector LineString with walk distance and walk time.
 */

import { describe, it, expect } from '@jest/globals';
import { snapToGate, type GateSnapperDeps, type GateRow } from '@/lib/dpmaps/perimeterGateSnapper';

describe('Perimeter Gate Snapper', () => {
  const pinLat = 23.8135;
  const pinLng = 90.4242;

  const mockGates: GateRow[] = [
    {
      id: 'gate-north',
      canonical_name: 'North Gate 1 (Kuril Side)',
      point_type: 'perimeter_gate',
      lat: 23.814,
      lng: 90.4245,
      vehicles: ['car', 'bike'],
    },
    {
      id: 'gate-south',
      canonical_name: 'South Gate 2',
      point_type: 'entrance',
      lat: 23.8125,
      lng: 90.4238,
      vehicles: ['bike', 'cng'],
    },
  ];

  const fakeDeps: GateSnapperDeps = {
    findVenueWithin: () => ({ id: 'venue-jfp', name: 'Jamuna Future Park', distanceM: 45 }),
    listChildGates: () => mockGates,
    distanceM: (lat1, lng1, lat2, lng2) => {
      // Approximate euclidean meter distance for unit tests
      return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2) * 111_000;
    },
  };

  it('snaps car pin to legal perimeter gate', async () => {
    const res = await snapToGate(fakeDeps, pinLat, pinLng, 'car');

    expect(res.snapped).toBe(true);
    expect(res.gate?.id).toBe('gate-north');
    expect(res.gate?.canonical_name).toBe('North Gate 1 (Kuril Side)');
    expect(res.connector).toBeDefined();
    expect(res.connector?.type).toBe('LineString');
    expect(res.connector?.coordinates).toEqual([
      [pinLng, pinLat],
      [90.4245, 23.814],
    ]);
    expect(res.connector?.walk_distance_m).toBeGreaterThan(0);
  });

  it('snaps cng pin to south gate when north gate excludes cng', async () => {
    const res = await snapToGate(fakeDeps, pinLat, pinLng, 'cng');

    expect(res.snapped).toBe(true);
    expect(res.gate?.id).toBe('gate-south');
    expect(res.gate?.canonical_name).toBe('South Gate 2');
  });

  it('returns no_venue when outside venue detection radius', async () => {
    const outsideDeps: GateSnapperDeps = {
      ...fakeDeps,
      findVenueWithin: () => null,
    };

    const res = await snapToGate(outsideDeps, 23.75, 90.38, 'car');
    expect(res.snapped).toBe(false);
    expect(res.reason).toBe('no_venue');
  });
});

