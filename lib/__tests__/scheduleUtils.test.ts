import { computeEstimatedDurationMinutes } from '../scheduleUtils';
import * as eta from '../eta';

// ── Mock the DB module (scheduleUtils.ts imports it for checkRideOverlap) ──
jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

// ── Mock the ETA module ────────────────────────────────────────────────────────
jest.mock('../eta', () => {
  const actual = jest.requireActual('../eta');
  return {
    ...actual,
    etaSpeedKmh: jest.fn(actual.etaSpeedKmh),
    timeBucket: jest.fn(actual.timeBucket),
    computeEtaMinutes: jest.fn(actual.computeEtaMinutes),
  };
});

// ── computeEstimatedDurationMinutes ────────────────────────────────────────────
describe('computeEstimatedDurationMinutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses offpeak speed when no scheduled_at provided', () => {
    // bike offpeak speed = 22 km/h
    // 10 km / 22 km/h * 60 = 27.27 → rounded to 27 min
    const result = computeEstimatedDurationMinutes(10, 'bike_basic');
    expect(result).toBe(27);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith('bike_basic', 'offpeak');
  });

  test('uses peak speed when scheduled_at falls in peak hours', () => {
    // Peak: 7-10 or 17-21 Dhaka time
    // Dhaka = UTC+6, so 8:00 Dhaka = 02:00 UTC
    const peakDate = new Date('2026-01-15T02:00:00Z'); // 08:00 Dhaka
    // bike peak speed = 15 km/h
    // 15 km / 15 km/h * 60 = 60 min
    const result = computeEstimatedDurationMinutes(15, 'bike_standard', peakDate);
    expect(result).toBe(60);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith('bike_standard', 'peak');
  });

  test('uses night speed when scheduled_at falls in night hours', () => {
    // Night: 23-7 Dhaka time
    // 1:00 Dhaka = 19:00 UTC previous day
    const nightDate = new Date('2026-01-14T19:00:00Z'); // 01:00 Dhaka
    // car night speed = 20 km/h
    // 20 km / 20 km/h * 60 = 60 min
    const result = computeEstimatedDurationMinutes(20, 'car_economy', nightDate);
    expect(result).toBe(60);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith('car_economy', 'night');
  });

  test('minimum duration is 1 minute', () => {
    // Very short distance → at least 1 min
    const result = computeEstimatedDurationMinutes(0.01, 'bike_basic');
    expect(result).toBeGreaterThanOrEqual(1);
  });

  test('handles zero distance gracefully', () => {
    const result = computeEstimatedDurationMinutes(0, 'car_comfort');
    expect(result).toBeGreaterThanOrEqual(1);
  });

  test('cng uses cng speed group', () => {
    // cng offpeak speed = 18 km/h
    // 9 km / 18 km/h * 60 = 30 min
    const result = computeEstimatedDurationMinutes(9, 'cng');
    expect(result).toBe(30);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith('cng', 'offpeak');
  });

  test('car_premium uses car speed group', () => {
    // car offpeak speed = 16 km/h
    // 8 km / 16 km/h * 60 = 30 min
    const result = computeEstimatedDurationMinutes(8, 'car_premium');
    expect(result).toBe(30);
    expect(eta.etaSpeedKmh).toHaveBeenCalledWith('car_premium', 'offpeak');
  });
});

// ── Overlap logic (unit-level, no DB) ─────────────────────────────────────────
// These tests verify the overlap predicate directly without hitting the DB.

describe('overlap predicate logic', () => {
  // Two windows overlap when: existingStart < newEnd AND existingEnd > newStart

  test('ride A ends before ride B starts → no overlap', () => {
    const aStart = new Date('2026-01-15T08:00:00Z');
    const aEnd = new Date('2026-01-15T09:00:00Z');
    const bStart = new Date('2026-01-15T09:00:00Z'); // starts exactly when A ends
    const bEnd = new Date('2026-01-15T10:00:00Z');

    // Overlap: aStart < bEnd (true) AND aEnd > bStart (false → 09:00 > 09:00 is false)
    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(false);
  });

  test('ride A ends 1 minute before ride B starts → no overlap', () => {
    const aStart = new Date('2026-01-15T08:00:00Z');
    const aEnd = new Date('2026-01-15T08:59:00Z');
    const bStart = new Date('2026-01-15T09:00:00Z');
    const bEnd = new Date('2026-01-15T10:00:00Z');

    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(false);
  });

  test('ride A ends 1 minute after ride B starts → overlap', () => {
    const aStart = new Date('2026-01-15T08:00:00Z');
    const aEnd = new Date('2026-01-15T09:01:00Z');
    const bStart = new Date('2026-01-15T09:00:00Z');
    const bEnd = new Date('2026-01-15T10:00:00Z');

    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(true);
  });

  test('ride B completely inside ride A → overlap', () => {
    const aStart = new Date('2026-01-15T08:00:00Z');
    const aEnd = new Date('2026-01-15T12:00:00Z');
    const bStart = new Date('2026-01-15T09:00:00Z');
    const bEnd = new Date('2026-01-15T10:00:00Z');

    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(true);
  });

  test('ride A completely inside ride B → overlap', () => {
    const aStart = new Date('2026-01-15T09:00:00Z');
    const aEnd = new Date('2026-01-15T10:00:00Z');
    const bStart = new Date('2026-01-15T08:00:00Z');
    const bEnd = new Date('2026-01-15T12:00:00Z');

    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(true);
  });

  test('rides at same time → overlap', () => {
    const t = new Date('2026-01-15T09:00:00Z');
    const aEnd = new Date('2026-01-15T10:00:00Z');
    const bEnd = new Date('2026-01-15T10:00:00Z');

    const overlap = t < bEnd && aEnd > t;
    expect(overlap).toBe(true);
  });

  test('ride A starts after ride B ends → no overlap', () => {
    const aStart = new Date('2026-01-15T11:00:00Z');
    const aEnd = new Date('2026-01-15T12:00:00Z');
    const bStart = new Date('2026-01-15T08:00:00Z');
    const bEnd = new Date('2026-01-15T09:00:00Z');

    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(false);
  });

  test('back-to-back with 15 min gap → no overlap', () => {
    // Ride A: 08:00–09:00, Ride B: 09:15–10:15
    const aStart = new Date('2026-01-15T08:00:00Z');
    const aEnd = new Date('2026-01-15T09:00:00Z');
    const bStart = new Date('2026-01-15T09:15:00Z');
    const bEnd = new Date('2026-01-15T10:15:00Z');

    const overlap = aStart < bEnd && aEnd > bStart;
    expect(overlap).toBe(false);
  });
});
