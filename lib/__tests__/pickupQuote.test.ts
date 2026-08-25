/**
 * lib/pickupQuote coverage (Phase F quote state 1):
 *  - disabled category / disabled fee → null (Stage 0 default)
 *  - zero-pool fallback distance + low-confidence flag, no route calls
 *  - ruling 5 route budget: exactly nearest + p75-reference positions routed
 *  - quantile reference-driver selection (pool of 5, q=0.75 → 4th driver)
 *  - routing failure → haversine × 1.4 + widened range (low −10%, high +25%)
 *  - backstop (40% of fare-before-pickup) applied on BOTH ends
 *  - multi-vehicle haversineOnly mode → 0 route calls
 *  - zone listed in pickup_low_confidence_zone_ids → widened + flagged
 *
 * DB (drivers/pricing) and the Barikoi route client are mocked.
 */

const mockState = {
  pricingRows: [] as { per_km_bdt: number }[],
  driverRows: [] as { id: string; lat: string | null; lng: string | null }[],
};

jest.mock('@/src/db', () => {
  const chain = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as Promise<unknown[]> & {
      limit: (n: number) => Promise<unknown[]>;
    };
    p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
    return p;
  };
  return {
    db: {
      select: jest.fn((fields: Record<string, unknown>) => {
        const isPricing = 'per_km_bdt' in fields;
        return {
          from: jest.fn(() => ({
            where: jest.fn(() =>
              chain(isPricing ? mockState.pricingRows : mockState.driverRows),
            ),
          })),
        };
      }),
    },
  };
});

jest.mock('../barikoi', () => ({
  getRouteDistance: jest.fn(),
}));

// h3-js cannot load under the jest-expo TextDecoder polyfill; the ring cells
// are irrelevant to the logic under test (the pool comes from the db mock).
jest.mock('../h3', () => ({
  getH3Ring: jest.fn(() => ['cell-1', 'cell-2', 'cell-3']),
}));

import { getRouteDistance } from '../barikoi';
import {
  pickupQuoteRange,
  type PickupQuoteConfig,
} from '../pickupQuote';
import {
  applyBackstop,
  computeFeeKm,
  haversineKm,
  pickupFeePaisa,
  ratePerKmPaisa,
  referenceKm,
} from '../pickupFee';
import type { VehicleTypeEnum } from '../vehicleTypes';

const getRouteDistanceMock = getRouteDistance as jest.Mock;

const PICKUP = { lat: 23.8, lng: 90.4 };
const ZONE_ID = '11111111-1111-4111-8111-111111111111';
const FARE_PAISA = 10_000; // backstop bound = 4000 paisa
const RATE = ratePerKmPaisa(1000, 'bike'); // 1000 paisa/km × 0.75 = 750

/** Drivers placed due north of the pickup at +0.01° latitude steps. */
function northDrivers(count: number): { id: string; lat: string; lng: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `driver-${i + 1}`,
    lat: (PICKUP.lat + 0.01 * (i + 1)).toFixed(6),
    lng: PICKUP.lng.toFixed(6),
  }));
}

function driverKm(i: number): number {
  return haversineKm(PICKUP.lat + 0.01 * (i + 1), PICKUP.lng, PICKUP.lat, PICKUP.lng);
}

function expectedFee(km: number, freeRadius: number): number {
  return applyBackstop(
    pickupFeePaisa(computeFeeKm(km, freeRadius), RATE, 2.0),
    FARE_PAISA,
    40,
  );
}

function makeCfg(overrides: Partial<PickupQuoteConfig> = {}): PickupQuoteConfig {
  return {
    pickup_fee_enabled: 'true',
    pickup_free_radius_km_bike: '1.0',
    pickup_free_radius_km_cng: '0',
    pickup_free_radius_km_car: '1.5',
    pickup_cap_billable_km_bike: '2.0',
    pickup_cap_billable_km_cng: '2.0',
    pickup_cap_billable_km_car: '2.0',
    pickup_cap_pct_of_fare: '40',
    pickup_reference_pool_size: '5',
    pickup_reference_quantile: '0.75',
    pickup_no_driver_fallback_km: '3.0',
    pickup_low_confidence_zone_ids: '',
    ...overrides,
  };
}

function quoteInput(
  vehicleType: VehicleTypeEnum = 'bike_standard',
  cfg: PickupQuoteConfig = makeCfg(),
) {
  return {
    zoneId: ZONE_ID,
    vehicleType,
    pickupLat: PICKUP.lat,
    pickupLng: PICKUP.lng,
    fareBeforePickupPaisa: FARE_PAISA,
    cfg,
  };
}

function routeOk(distanceKm: number) {
  return Promise.resolve({
    distanceKm,
    durationMin: 5,
    provider: 'barikoi' as const,
    polyline: 'x',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.pricingRows = [{ per_km_bdt: 1000 }];
  mockState.driverRows = northDrivers(5);
});

describe('gating — feature off', () => {
  test('fee disabled → null even with drivers present', async () => {
    const result = await pickupQuoteRange(quoteInput('bike_standard', makeCfg({ pickup_fee_enabled: 'false' })));
    expect(result).toBeNull();
    expect(getRouteDistanceMock).not.toHaveBeenCalled();
  });

  test('category radius 0 (cng unset) → null', async () => {
    const result = await pickupQuoteRange(quoteInput('cng'));
    expect(result).toBeNull();
    expect(getRouteDistanceMock).not.toHaveBeenCalled();
  });

  test('no active pricing row → null', async () => {
    mockState.pricingRows = [];
    const result = await pickupQuoteRange(quoteInput());
    expect(result).toBeNull();
  });
});

describe('zero-pool fallback', () => {
  test('empty pool → fallback distance both ends, low-confidence, no route calls', async () => {
    mockState.driverRows = [];
    const result = await pickupQuoteRange(quoteInput());

    // fallback 3.0 km − free radius 1.0 = 2.0 chargeable, capped at 2.0
    expect(result).toEqual({
      lowPaisa: expectedFee(3.0, 1.0),
      highPaisa: expectedFee(3.0, 1.0),
      lowConfidence: true,
    });
    expect(result?.lowPaisa).toBe(1500); // 750 × 2.0, backstop 4000 not binding
    expect(getRouteDistanceMock).not.toHaveBeenCalled();
  });

  test('drivers without positions are excluded from the pool', async () => {
    mockState.driverRows = [
      { id: 'd-null', lat: null, lng: null },
      ...northDrivers(1),
    ];
    getRouteDistanceMock.mockReturnValue(routeOk(4.0));
    const result = await pickupQuoteRange(quoteInput());
    expect(result).not.toBeNull();
    expect(result?.lowConfidence).toBe(false);
    expect(getRouteDistanceMock).toHaveBeenCalledTimes(1);
    expect(getRouteDistanceMock.mock.calls[0][0]).toBeCloseTo(PICKUP.lat + 0.01, 6);
  });
});

describe('ruling 5 route budget + quantile reference selection', () => {
  test('routes exactly 2 calls: nearest (pool[0]) and p75 reference (pool[3])', async () => {
    getRouteDistanceMock
      .mockReturnValueOnce(routeOk(2.0)) // nearest routed km
      .mockReturnValueOnce(routeOk(5.0)); // reference routed km

    const result = await pickupQuoteRange(quoteInput());

    expect(getRouteDistanceMock).toHaveBeenCalledTimes(2);
    // First call: nearest driver position → pickup pin
    expect(getRouteDistanceMock.mock.calls[0][0]).toBeCloseTo(PICKUP.lat + 0.01, 6);
    expect(getRouteDistanceMock.mock.calls[0][1]).toBeCloseTo(PICKUP.lng, 6);
    expect(getRouteDistanceMock.mock.calls[0][2]).toBe(PICKUP.lat);
    expect(getRouteDistanceMock.mock.calls[0][3]).toBe(PICKUP.lng);
    // Second call: q=0.75 over 5 drivers → idx 3 → the 4th-nearest driver
    expect(getRouteDistanceMock.mock.calls[1][0]).toBeCloseTo(PICKUP.lat + 0.04, 6);

    expect(result).toEqual({
      lowPaisa: expectedFee(2.0, 1.0), // 750
      highPaisa: expectedFee(5.0, 1.0), // capped 2.0 km → 1500
      lowConfidence: false,
    });
  });

  test('pool truncated to pickup_reference_pool_size (3 → reference is pool[2])', async () => {
    getRouteDistanceMock
      .mockReturnValueOnce(routeOk(2.0))
      .mockReturnValueOnce(routeOk(5.0));

    await pickupQuoteRange(
      quoteInput('bike_standard', makeCfg({ pickup_reference_pool_size: '3' })),
    );

    expect(getRouteDistanceMock).toHaveBeenCalledTimes(2);
    // q=0.75 over 3 drivers → idx 1.5 → ceil 2 → 3rd-nearest driver
    expect(getRouteDistanceMock.mock.calls[1][0]).toBeCloseTo(PICKUP.lat + 0.03, 6);
  });

  test('single-driver pool → one route call, low = high', async () => {
    mockState.driverRows = northDrivers(1);
    getRouteDistanceMock.mockReturnValue(routeOk(4.0));

    const result = await pickupQuoteRange(quoteInput());

    expect(getRouteDistanceMock).toHaveBeenCalledTimes(1);
    expect(result?.lowPaisa).toBe(result?.highPaisa);
    expect(result?.lowConfidence).toBe(false);
  });
});

describe('routing failure — haversine × 1.4 + widened range', () => {
  test('provider falls back to haversine_fallback → ×1.4 distances, widen, low-confidence', async () => {
    getRouteDistanceMock.mockResolvedValue({
      distanceKm: 99,
      durationMin: 5,
      provider: 'haversine_fallback',
      polyline: null,
    });

    const result = await pickupQuoteRange(quoteInput());

    // Distances become haversine(driver, pickup) × 1.4
    const nearestKm = driverKm(0) * 1.4;
    const refKm = driverKm(3) * 1.4;
    const rawLow = expectedFee(nearestKm, 1.0);
    const rawHigh = expectedFee(refKm, 1.0);

    expect(result).toEqual({
      lowPaisa: Math.max(0, Math.round(rawLow * 0.9)),
      highPaisa: Math.max(0, Math.round(rawHigh * 1.25)),
      lowConfidence: true,
    });
  });

  test('route client throwing is treated the same as failure', async () => {
    getRouteDistanceMock.mockRejectedValue(new Error('route api down'));

    const result = await pickupQuoteRange(quoteInput());

    expect(result?.lowConfidence).toBe(true);
    expect(result?.highPaisa).toBeGreaterThan(result?.lowPaisa ?? 0);
  });
});

describe('backstop — applied on BOTH ends', () => {
  test('small fare-before-pickup clamps both low and high', async () => {
    getRouteDistanceMock
      .mockReturnValueOnce(routeOk(2.0))
      .mockReturnValueOnce(routeOk(5.0));

    const result = await pickupQuoteRange({
      ...quoteInput(),
      fareBeforePickupPaisa: 1000, // 40% backstop = 400 paisa
    });

    // Raw fees 750 / 1500 both clamp to 400
    expect(result?.lowPaisa).toBe(400);
    expect(result?.highPaisa).toBe(400);
    expect(result?.lowConfidence).toBe(false);
  });
});

describe('multi-vehicle haversineOnly mode', () => {
  test('0 route calls; ×1.4 haversine distances for low and p75 high', async () => {
    const result = await pickupQuoteRange({ ...quoteInput(), haversineOnly: true });

    expect(getRouteDistanceMock).not.toHaveBeenCalled();

    const nearestKm = driverKm(0) * 1.4;
    const refKm = referenceKm(
      [1, 2, 3, 4, 5].map(driverKm),
      0.75,
    ) * 1.4;

    expect(result).toEqual({
      lowPaisa: expectedFee(nearestKm, 1.0),
      highPaisa: expectedFee(refKm, 1.0),
      lowConfidence: false,
    });
  });

  test('zero-pool fallback also applies in haversineOnly mode', async () => {
    mockState.driverRows = [];
    const result = await pickupQuoteRange({ ...quoteInput(), haversineOnly: true });

    expect(result?.lowConfidence).toBe(true);
    expect(result?.lowPaisa).toBe(1500);
    expect(getRouteDistanceMock).not.toHaveBeenCalled();
  });
});

describe('pickup_low_confidence_zone_ids widening', () => {
  test('zone listed in CSV → widened range + low-confidence, routing healthy', async () => {
    getRouteDistanceMock
      .mockReturnValueOnce(routeOk(2.0))
      .mockReturnValueOnce(routeOk(5.0));

    const result = await pickupQuoteRange(
      quoteInput(
        'bike_standard',
        makeCfg({ pickup_low_confidence_zone_ids: ZONE_ID }),
      ),
    );

    expect(result).toEqual({
      lowPaisa: Math.max(0, Math.round(expectedFee(2.0, 1.0) * 0.9)), // 750 → 675
      highPaisa: Math.max(0, Math.round(expectedFee(5.0, 1.0) * 1.25)), // 1500 → 1875
      lowConfidence: true,
    });
  });
});
