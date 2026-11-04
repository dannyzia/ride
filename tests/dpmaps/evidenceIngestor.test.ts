/**
 * tests/dpmaps/evidenceIngestor.test.ts
 *
 * Verifies PII scrubbing and continuous learning telemetry ingestion:
 * 1. piiScrubber drops phone numbers and emails while preserving address numbers.
 * 2. Ingestor computes H3 res10 and pseudonyms without leaking raw user IDs.
 * 3. Ingestion flag disables telemetry when set to 'false'.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { scrubPii } from '@/lib/dpmaps/piiScrubber';

const mockExecute = jest.fn<any>();
jest.mock('@/src/db', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

const mockGetConfigValue = jest.fn<any>();
jest.mock('@/lib/platformConfig', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

jest.mock('@/lib/h3', () => ({
  getH3CellRes10: jest.fn(() => '8a2a1072bffffff'),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ingestCompletedTrip } from '@/lib/dpmaps/evidenceIngestor';

describe('PII Scrubber (Clean Room Contract)', () => {
  it('drops standard Bangladeshi mobile phone numbers', () => {
    expect(scrubPii('Star Kabab 01711223344')).toBe('Star Kabab');
    expect(scrubPii('Star Kabab 01912345678 Dhanmondi')).toBe('Star Kabab Dhanmondi');
  });

  it('folds Bengali digits and drops phone numbers', () => {
    expect(scrubPii('Star Kabab ০১৭-১১২২-৩৩৪৪')).toBe('Star Kabab');
    expect(scrubPii('NSU +8801711223344 gate')).toBe('NSU gate');
  });

  it('drops email addresses', () => {
    expect(scrubPii('Rapa Plaza contact@rapaplaza.com mor')).toBe('Rapa Plaza mor');
  });

  it('preserves address numbers like road and house', () => {
    expect(scrubPii('Road 12 House 34 Block D')).toBe('Road 12 House 34 Block D');
    expect(scrubPii('Dhanmondi 27')).toBe('Dhanmondi 27');
  });

  it('handles empty or malformed inputs', () => {
    expect(scrubPii('')).toBe('');
    expect(scrubPii(null as unknown as string)).toBe('');
  });
});

describe('Evidence Ingestor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConfigValue.mockResolvedValue('true');
    mockExecute.mockResolvedValue({});
  });

  it('ingests valid completed ride telemetry and returns pseudonyms and H3 cell', async () => {
    const res = await ingestCompletedTrip({
      rider_user_id: 'rider-uuid-1234',
      driver_user_id: 'driver-uuid-5678',
      typed_query: 'Jamuna Future Park Kuril',
      driver_dropoff_gps: {
        lat: 23.8135,
        lng: 90.4242,
      },
      completed_at: new Date('2026-11-04T12:00:00Z'),
    });

    expect(res.accepted).toBe(true);
    expect(res.h3_res10).toBeDefined();
    expect(res.h3_res10?.length).toBe(15);
    expect(res.trip_hash).toBeDefined();
    // Raw user IDs must NOT appear in output
    expect(res.trip_hash).not.toContain('rider-uuid-1234');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('rejects queries that are empty or too short after PII scrubbing', async () => {
    const res = await ingestCompletedTrip({
      rider_user_id: 'rider-uuid-1234',
      driver_user_id: 'driver-uuid-5678',
      typed_query: '01711223344', // Only phone number -> scrubbed to empty
      driver_dropoff_gps: { lat: 23.8135, lng: 90.4242 },
    });

    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('QUERY_TOO_SHORT_OR_EMPTY_AFTER_SCRUB');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects coordinates outside Bangladesh operational region', async () => {
    const res = await ingestCompletedTrip({
      rider_user_id: 'rider-uuid-1234',
      driver_user_id: 'driver-uuid-5678',
      typed_query: 'Central Park New York',
      driver_dropoff_gps: { lat: 40.785091, lng: -73.968285 },
    });

    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('COORDINATES_OUTSIDE_REGION');
  });

  it('skips ingestion when learning ingest is disabled in config', async () => {
    mockGetConfigValue.mockResolvedValue('false');

    const res = await ingestCompletedTrip({
      rider_user_id: 'rider-uuid-1234',
      driver_user_id: 'driver-uuid-5678',
      typed_query: 'Bashundhara City Mall',
      driver_dropoff_gps: { lat: 23.7508, lng: 90.3916 },
    });

    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('INGESTION_DISABLED');
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
