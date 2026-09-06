/**
 * Polyline passthrough coverage for lib/barikoi (CG-1):
 *  - Barikoi (OSRM-style) path: routes[0].geometry → RouteResult.polyline
 *  - Barikoi response without geometry → polyline null (defensive access)
 *  - Google fallback path: overview_polyline.points → RouteResult.polyline
 *  - Haversine fallback path → polyline null (no road path to encode)
 *
 * DB (maps_provider toggle) and fetch are mocked.
 */

import type * as BarikoiModule from '../barikoi';

const mockState = {
  systemConfigRows: [] as { value: string }[],
};

jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => mockState.systemConfigRows),
        })),
      })),
    })),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const BARIKOI_POLYLINE = '_p~iF~ps|U_ulLnnqC_mf`~_ceh~u@';
const GOOGLE_POLYLINE = 'gptsE~qvyU_eq@sjlb@';

let barikoi: typeof BarikoiModule;
let fetchMock: jest.Mock;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeAll(() => {
  process.env.BARIKOI_API_KEY = 'test-barikoi-key';
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-google-key';
  jest.resetModules();
  barikoi = require('../barikoi');
  fetchMock = jest.fn();
  jest.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  fetchMock.mockReset();
  mockState.systemConfigRows = [{ value: 'barikoi' }];
});

describe('Barikoi route path — polyline passthrough', () => {
  test('routes[0].geometry is returned on RouteResult.polyline', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'Ok',
        routes: [
          {
            distance: 3500,
            duration: 660,
            geometry: BARIKOI_POLYLINE,
            legs: [{ distance: 3500, duration: 660 }],
          },
        ],
        waypoints: [],
      }),
    );

    const r = await barikoi.getRouteDistance(23.8, 90.4, 23.81, 90.41);

    expect(r.provider).toBe('barikoi');
    expect(r.distanceKm).toBeCloseTo(3.5, 6);
    expect(r.durationMin).toBeCloseTo(11, 6);
    expect(r.polyline).toBe(BARIKOI_POLYLINE);
    // geometries=polyline must be requested on the Barikoi URL
    expect(fetchMock.mock.calls[0][0]).toContain('geometries=polyline');
  });

  test('response without geometry field → polyline null, route still used', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 'Ok',
        routes: [{ distance: 1200, duration: 300, legs: [] }],
        waypoints: [],
      }),
    );

    const r = await barikoi.getRouteDistance(23.8, 90.4, 23.801, 90.401);

    expect(r.provider).toBe('barikoi');
    expect(r.distanceKm).toBeCloseTo(1.2, 6);
    expect(r.polyline).toBeNull();
  });
});

describe('Google fallback path — polyline passthrough', () => {
  test('overview_polyline.points is returned on RouteResult.polyline', async () => {
    mockState.systemConfigRows = [{ value: 'google' }];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'OK',
        routes: [
          {
            legs: [
              { distance: { value: 4200 }, duration: { value: 720 } },
            ],
            overview_polyline: { points: GOOGLE_POLYLINE },
          },
        ],
      }),
    );

    const r = await barikoi.getRouteDistance(23.8, 90.4, 23.82, 90.42);

    expect(r.provider).toBe('google');
    expect(r.distanceKm).toBeCloseTo(4.2, 6);
    expect(r.durationMin).toBeCloseTo(12, 6);
    expect(r.polyline).toBe(GOOGLE_POLYLINE);
    // Google preferred → the first fetch is the Google Directions URL
    expect(fetchMock.mock.calls[0][0]).toContain('maps.googleapis.com');
  });
});

describe('Haversine fallback path — no polyline', () => {
  test('both providers failing → polyline null, provider haversine_fallback', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const r = await barikoi.getRouteDistanceDuration(23.8, 90.4, 23.82, 90.42, true);

    expect(r.provider).toBe('haversine_fallback');
    expect(r.polyline).toBeNull();
    expect(r.distanceKm).toBeGreaterThan(0);
    // barikoi + google were both attempted before falling back
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
