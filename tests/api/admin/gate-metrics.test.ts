/**
 * T-A10: Fare gate metrics — thresholds from config, not hardcoded.
 *
 * Verifies that the fare-gate-metrics+api.ts route:
 * 1. Reads fare_gate_* thresholds from platform_config via getFareFrameworkConfig
 * 2. Threshold = 0 → status = 'calibration_needed' (PATCH 5)
 * 3. Threshold > 0 → status = 'green' or 'red' based on measured value
 * 4. No hardcoded threshold values in the API handler
 */

// Mock getFareFrameworkConfig to return controlled thresholds
const mockGetConfig = jest.fn();
jest.mock('@/lib/fareFrameworkConfig', () => ({
  getFareFrameworkConfig: (...args: unknown[]) => mockGetConfig(...args),
  parseConfigNumber: (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  },
}));

jest.mock('@/lib/adminRbac', () => ({
  requireAdminPermission: jest.fn(() =>
    jest.fn(async () => ({
      supabaseUser: { id: 'admin-1111' },
      dbUser: { id: 'admin-1111', role: 'admin' },
    })),
  ),
  isOwner: (u: { role: string }) => u.role === 'owner',
  OWNER_ONLY_CONFIG_KEYS: new Set<string>(),
  GUARDRAIL_KM_KEYS: new Set<string>(),
  guardrailViolation: () => false,
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock db with a queue-based select
let mockSelectQueue: unknown[][] = [];
let mockSelectCallIndex = 0;

jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn(() => {
      const rows = mockSelectQueue[mockSelectCallIndex] ?? [];
      mockSelectCallIndex++;
      const promise = Promise.resolve(rows);
      // Flexible chain: every method returns the same promise or a thenable
      const chain: Record<string, unknown> = {
        limit: jest.fn(() => promise),
        orderBy: jest.fn(() => chain),
        groupBy: jest.fn(() => chain),
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
      };
      const fromResult: Record<string, unknown> = {
        where: jest.fn(() => chain),
        innerJoin: jest.fn(() => ({
          where: jest.fn(() => chain),
        })),
        orderBy: jest.fn(() => chain),
        // from() can be awaited directly (raw SQL subquery path)
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
      };
      const fromFn = jest.fn(() => fromResult);
      return { from: fromFn };
    }),
  },
}));

import { GET } from '@/app/api/admin/fare-gate-metrics+api';

function apiRequest(): Request {
  return {
    url: 'http://localhost:8081/api/admin/fare-gate-metrics',
    headers: { get: () => null },
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectQueue = [];
  mockSelectCallIndex = 0;
});

/** 13 empty result rows: 6 gate queries + 1 zone_heat + 1 platform_config + 5 deviation detail queries. */
const EMPTY_QUEUE: unknown[][] = [
  [], [], [], [], [], [], [], [], // gate queries
  [], [], [], [], [],             // deviation detail (shadow coverage, 7d, vehicle type, dist, recent)
];

describe('T-A10 — gate metrics from config', () => {
  test('threshold=0 → calibration_needed for all metrics (PATCH 5)', async () => {
    mockGetConfig.mockResolvedValue(
      Object.fromEntries([
        'fare_gate_complaint_rate_max',
        'fare_gate_deviation_max_pct',
        'fare_gate_periphery_drop_max_pp',
        'fare_gate_backstop_binding_max_pct',
        'fare_gate_retention_drop_max_pp',
        'fare_gate_heat_correlation_min',
      ].map((k) => [k, '0'])),
    );

    mockSelectQueue = EMPTY_QUEUE;

    const res = await GET(apiRequest());
    const body = await res.json();

    expect(body.metrics).toBeDefined();
    expect(body.metrics.length).toBe(6);
    for (const metric of body.metrics) {
      expect(metric.status).toBe('calibration_needed');
    }
  });

  test('threshold>0 with high measured → red (lower_better gate)', async () => {
    mockGetConfig.mockResolvedValue({
      fare_gate_complaint_rate_max: '5',
      fare_gate_deviation_max_pct: '0',
      fare_gate_periphery_drop_max_pp: '0',
      fare_gate_backstop_binding_max_pct: '0',
      fare_gate_retention_drop_max_pp: '0',
      fare_gate_heat_correlation_min: '0',
    });

    // 10 complaints / 1000 rides = 10 per 1k > 5 → red
    mockSelectQueue = [
      [{ count: 10 }],
      [{ count: 1000 }],
      [], [], [],
      [{ count: 0 }],
      [{ count: 10 }],
      [{ value: null }],
      // deviation detail queries (all empty)
      [{ count: 0 }], // shadow coverage
      [],              // 7d deviation
      [],              // vehicle type breakdown
      [],              // distribution
      [],              // recent rides
    ];

    const res = await GET(apiRequest());
    const body = await res.json();

    const m = body.metrics.find((x: { key: string }) => x.key === 'complaint_rate');
    expect(m).toBeDefined();
    expect(m.status).toBe('red');
    expect(m.threshold).toBe(5);
  });

  test('threshold>0 with low measured → green', async () => {
    mockGetConfig.mockResolvedValue({
      fare_gate_complaint_rate_max: '5',
      fare_gate_deviation_max_pct: '0',
      fare_gate_periphery_drop_max_pp: '0',
      fare_gate_backstop_binding_max_pct: '0',
      fare_gate_retention_drop_max_pp: '0',
      fare_gate_heat_correlation_min: '0',
    });

    // 2 complaints / 1000 rides = 2 per 1k < 5 → green
    mockSelectQueue = [
      [{ count: 2 }],
      [{ count: 1000 }],
      [], [], [],
      [{ count: 0 }],
      [{ count: 10 }],
      [{ value: null }],
      // deviation detail queries (all empty)
      [{ count: 0 }], // shadow coverage
      [],              // 7d deviation
      [],              // vehicle type breakdown
      [],              // distribution
      [],              // recent rides
    ];

    const res = await GET(apiRequest());
    const body = await res.json();

    const m = body.metrics.find((x: { key: string }) => x.key === 'complaint_rate');
    expect(m.status).toBe('green');
  });

  test('no hardcoded thresholds: config keys are passed to getFareFrameworkConfig', async () => {
    const configKeys = [
      'fare_gate_complaint_rate_max',
      'fare_gate_deviation_max_pct',
      'fare_gate_periphery_drop_max_pp',
      'fare_gate_backstop_binding_max_pct',
      'fare_gate_retention_drop_max_pp',
      'fare_gate_heat_correlation_min',
    ];

    mockGetConfig.mockResolvedValue(
      Object.fromEntries(configKeys.map((k) => [k, '999'])),
    );

    mockSelectQueue = [
      [{ count: 0 }], [{ count: 1000 }],
      [], [], [], [{ count: 5 }], [{ count: 5 }], [{ value: '0.9' }],
      // deviation detail queries (all empty)
      [{ count: 0 }], // shadow coverage
      [],              // 7d deviation
      [],              // vehicle type breakdown
      [],              // distribution
      [],              // recent rides
    ];

    await GET(apiRequest());

    expect(mockGetConfig).toHaveBeenCalledWith(configKeys);
  });
});
