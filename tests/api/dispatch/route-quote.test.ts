/**
 * tests/api/dispatch/route-quote.test.ts
 *
 * Verifies POST /api/dispatch/route-quote:
 * 1. Valid coordinates return route distance, duration, polyline, and served_by.
 * 2. Invalid inputs return 400.
 * 3. Fare computation is included when pricing is active.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetDispatchRoute = jest.fn<any>();
jest.mock('@/lib/dpmaps/mapsRouter', () => ({
  getDispatchRoute: (...args: unknown[]) => mockGetDispatchRoute(...args),
}));

const mockSelect = jest.fn<any>();
jest.mock('@/src/db', () => ({
  db: {
    select: () => mockSelect(),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { POST } from '@/app/api/dispatch/route-quote+api';

describe('POST /api/dispatch/route-quote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDispatchRoute.mockResolvedValue({
      distanceKm: 5.4,
      durationMin: 12.5,
      provider: 'osrm',
      polyline: 'mock_polyline',
      latencyMs: 38,
    });
    mockSelect.mockReturnValue({
      from: jest.fn<any>().mockReturnValue({
        where: jest.fn<any>().mockReturnValue({
          limit: jest.fn<any>().mockResolvedValue([
            {
              base_fare_bdt: 50,
              per_km_bdt: 25,
              per_min_bdt: 2,
              intercity_per_km_bdt: 30,
              floor_length_km: 2,
              floor_min: 5,
              brta_fare_ceiling_bdt: 500,
              platform_commission_percent: 10,
            },
          ]),
        }),
      }),
    });
  });

  it('calculates quote and returns distance, duration, and served_by', async () => {
    const req = new Request('http://localhost/api/dispatch/route-quote', {
      method: 'POST',
      body: JSON.stringify({
        pickup: { lat: 23.7785, lng: 90.418 },
        dropoff: { lat: 23.7538, lng: 90.3712 },
        vehicle_type: 'car',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.distance_meters).toBe(5400);
    expect(body.duration_seconds).toBe(750);
    expect(body.served_by).toBe('osrm');
    expect(body.polyline).toBe('mock_polyline');
    expect(body.fare_bdt).toBeGreaterThan(0);
  });

  it('rejects missing pickup or dropoff coordinates with 400', async () => {
    const req = new Request('http://localhost/api/dispatch/route-quote', {
      method: 'POST',
      body: JSON.stringify({
        pickup: { lat: 23.7785 },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range coordinates with 400', async () => {
    const req = new Request('http://localhost/api/dispatch/route-quote', {
      method: 'POST',
      body: JSON.stringify({
        pickup: { lat: 999, lng: 90.418 },
        dropoff: { lat: 23.7538, lng: 90.3712 },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

