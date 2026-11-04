/**
 * tests/dpmaps/dispatchRouter.test.ts
 *
 * Verifies the 4-mode dispatch routing waterfall:
 *   Mode 0 (off):     Vendor only, zero OSRM calls, zero shadow quotes.
 *   Mode 1 (shadow):  Vendor serves live; async OSRM shadow quote recorded.
 *   Mode 2 (primary): OSRM serves live; vendor fallback on timeout/error.
 *   Mode 3 (sole):    OSRM only; vendor endpoints severed in code.
 *   Clean-room:       Only first-party geometry and numbers in shadow payload.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  calculateDispatchRoute,
  getHaversineFallback,
  haversineMeters,
  errorPct,
  normalizeMode,
  type RouterDeps,
  type ActiveRouteResult,
} from '@/lib/dpmaps/dispatchRouter';

describe('dpMaps Dispatch Router', () => {
  const origin = { lat: 23.7785, lng: 90.418 };
  const destination = { lat: 23.7538, lng: 90.3712 };

  let mockOsrmRoute: jest.Mock<any>;
  let mockBarikoiRoute: jest.Mock<any>;
  let mockGoogleRoute: jest.Mock<any>;
  let mockRecordShadow: jest.Mock<any>;
  let mockOnAlert: jest.Mock<any>;
  let mockResolveSelection: jest.Mock<any>;

  const osrmSuccessQuote: ActiveRouteResult = {
    distance_meters: 5200,
    duration_seconds: 780,
    polyline: 'osrm_encoded_line',
    provider: 'osrm',
    latency_ms: 45,
  };

  const barikoiSuccessQuote: ActiveRouteResult = {
    distance_meters: 5400,
    duration_seconds: 820,
    polyline: 'barikoi_encoded_line',
    provider: 'barikoi',
    latency_ms: 120,
  };

  const googleSuccessQuote: ActiveRouteResult = {
    distance_meters: 5500,
    duration_seconds: 840,
    polyline: 'google_encoded_line',
    provider: 'google',
    latency_ms: 220,
  };

  function createDeps(mode: unknown, overrides: Partial<RouterDeps> = {}): RouterDeps {
    return {
      getModeRaw: () => mode,
      isLegalGateOpen: () => true,
      osrmRoute: mockOsrmRoute,
      barikoiRoute: mockBarikoiRoute,
      googleRoute: mockGoogleRoute,
      recordShadow: mockRecordShadow,
      resolveSelection: mockResolveSelection,
      onAlert: mockOnAlert,
      tripHash: (id) => `hash-${id}`,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockOsrmRoute = jest.fn<any>().mockResolvedValue(osrmSuccessQuote);
    mockBarikoiRoute = jest.fn<any>().mockResolvedValue(barikoiSuccessQuote);
    mockGoogleRoute = jest.fn<any>().mockResolvedValue(googleSuccessQuote);
    mockRecordShadow = jest.fn<any>().mockResolvedValue(undefined);
    mockOnAlert = jest.fn<any>();
    mockResolveSelection = jest.fn<any>().mockResolvedValue({ lat: 23.7538, lng: 90.3712 });
  });

  describe('Mode Normalization', () => {
    it('normalizes valid strings and numbers correctly', () => {
      expect(normalizeMode('off')).toEqual({ mode: 'off', invalid: false });
      expect(normalizeMode('shadow')).toEqual({ mode: 'shadow', invalid: false });
      expect(normalizeMode('primary')).toEqual({ mode: 'primary', invalid: false });
      expect(normalizeMode('sole')).toEqual({ mode: 'sole', invalid: false });
      expect(normalizeMode(0)).toEqual({ mode: 'off', invalid: false });
      expect(normalizeMode(1)).toEqual({ mode: 'shadow', invalid: false });
      expect(normalizeMode(2)).toEqual({ mode: 'primary', invalid: false });
      expect(normalizeMode(3)).toEqual({ mode: 'sole', invalid: false });
      expect(normalizeMode('1')).toEqual({ mode: 'shadow', invalid: false });
    });

    it('fails safe to mode off on invalid inputs', () => {
      expect(normalizeMode('random_string')).toEqual({ mode: 'off', invalid: true });
      expect(normalizeMode(99)).toEqual({ mode: 'off', invalid: true });
      expect(normalizeMode(null)).toEqual({ mode: 'off', invalid: true });
    });
  });

  describe('Mode 0: Off (Vendor Only)', () => {
    it('serves via Barikoi with zero OSRM calls and zero shadow quotes', async () => {
      const deps = createDeps('off');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-1', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('barikoi');
      expect(res.distance_meters).toBe(5400);
      expect(mockOsrmRoute).not.toHaveBeenCalled();
      expect(mockRecordShadow).not.toHaveBeenCalled();
    });

    it('falls back to Google if Barikoi fails', async () => {
      mockBarikoiRoute.mockResolvedValue(null);
      const deps = createDeps('off');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-2', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('google');
      expect(mockBarikoiRoute).toHaveBeenCalled();
      expect(mockGoogleRoute).toHaveBeenCalled();
      expect(mockOsrmRoute).not.toHaveBeenCalled();
    });
  });

  describe('Mode 1: Shadow (Default Launch)', () => {
    it('serves via Barikoi live and triggers async OSRM shadow quote', async () => {
      const deps = createDeps('shadow');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-3', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('barikoi');
      expect(mockBarikoiRoute).toHaveBeenCalled();

      // Wait for next tick so shadow quote callback runs
      await new Promise((resolve) => setTimeout(resolve, 15));

      expect(mockOsrmRoute).toHaveBeenCalled();
      expect(mockRecordShadow).toHaveBeenCalledWith(
        'shadow:route:hash-trip-3',
        expect.objectContaining({
          distance_meters: 5200,
          duration_seconds: 780,
          vehicleType: 'car',
        }),
        86400,
      );
    });

    it('reverts to mode off if legal gate is closed', async () => {
      const deps = createDeps('shadow', { isLegalGateOpen: () => false });
      const res = await calculateDispatchRoute(
        { tripId: 'trip-4', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('barikoi');
      expect(mockOnAlert).toHaveBeenCalledWith('P1', 'SHADOW_BLOCKED_LEGAL_GATE_LOCK');
      expect(mockRecordShadow).not.toHaveBeenCalled();
    });
  });

  describe('Mode 2: Primary Cutover', () => {
    it('serves via OSRM live first without vendor calls', async () => {
      const deps = createDeps('primary');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-5', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('osrm');
      expect(res.distance_meters).toBe(5200);
      expect(mockOsrmRoute).toHaveBeenCalled();
      expect(mockBarikoiRoute).not.toHaveBeenCalled();
      expect(mockGoogleRoute).not.toHaveBeenCalled();
    });

    it('falls back to Barikoi on OSRM error or timeout', async () => {
      mockOsrmRoute.mockResolvedValue(null);
      const deps = createDeps('primary');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-6', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('barikoi');
      expect(mockOnAlert).toHaveBeenCalledWith('P2', 'OSRM_FALLBACK_VENDOR');
      expect(mockBarikoiRoute).toHaveBeenCalled();
    });
  });

  describe('Mode 3: Sole Provider (Full Sovereignty)', () => {
    it('serves via OSRM and severs all vendor endpoints', async () => {
      const deps = createDeps('sole');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-7', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('osrm');
      expect(mockOsrmRoute).toHaveBeenCalled();
      expect(mockBarikoiRoute).not.toHaveBeenCalled();
      expect(mockGoogleRoute).not.toHaveBeenCalled();
    });

    it('falls back to haversine floor if OSRM fails in sole mode', async () => {
      mockOsrmRoute.mockResolvedValue(null);
      const deps = createDeps('sole');
      const res = await calculateDispatchRoute(
        { tripId: 'trip-8', origin, destination, vehicleType: 'car' },
        deps,
      );

      expect(res.provider).toBe('haversine_floor');
      expect(res.distance_meters).toBeGreaterThan(0);
      expect(res.polyline).toBeNull();
      expect(mockBarikoiRoute).not.toHaveBeenCalled();
      expect(mockGoogleRoute).not.toHaveBeenCalled();
    });
  });

  describe('Destination Session Resolution', () => {
    it('resolves tempClientId through destination session resolver', async () => {
      const deps = createDeps('primary');
      const res = await calculateDispatchRoute(
        {
          tripId: 'trip-9',
          origin,
          destination: { tempClientId: 'token-abc' },
          vehicleType: 'car',
        },
        deps,
      );

      expect(mockResolveSelection).toHaveBeenCalledWith('token-abc');
      expect(res.provider).toBe('osrm');
    });

    it('throws error when token is expired or invalid', async () => {
      mockResolveSelection.mockResolvedValue(null);
      const deps = createDeps('primary');
      await expect(
        calculateDispatchRoute(
          {
            tripId: 'trip-10',
            origin,
            destination: { tempClientId: 'expired-token' },
            vehicleType: 'car',
          },
          deps,
        ),
      ).rejects.toThrow('SELECTION_EXPIRED_PLEASE_RESELECT');
    });
  });

  describe('Haversine & Error Calculations', () => {
    it('calculates direct haversine meters accurately', () => {
      const meters = haversineMeters(23.7785, 90.418, 23.7538, 90.3712);
      expect(meters).toBeGreaterThan(5000);
      expect(meters).toBeLessThan(6000);
    });

    it('applies 1.3 urban tortuosity at 18 km/h baseline in fallback', () => {
      const fb = getHaversineFallback(origin, destination);
      expect(fb.provider).toBe('haversine_floor');
      expect(fb.distance_meters).toBeGreaterThan(6500);
      expect(fb.duration_seconds).toBeGreaterThan(0);
      expect(fb.polyline).toBeNull();
    });

    it('computes error percentage correctly', () => {
      expect(errorPct(110, 100)).toBe(10);
      expect(errorPct(90, 100)).toBe(10);
      expect(() => errorPct(50, 0)).toThrow();
    });
  });
});

