/**
 * tests/api/search/autocomplete.test.ts
 *
 * Verifies GET /api/search/autocomplete:
 * 1. Returns suggestions with session tokens for vendor results.
 * 2. Returns empty suggestions on queries under 2 characters.
 * 3. Handles proximity parameters and language headers cleanly.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSearchMixedAutocomplete = jest.fn<any>();
jest.mock('@/lib/dpmaps/searchOrchestrator', () => ({
  searchMixedAutocomplete: (...args: unknown[]) => mockSearchMixedAutocomplete(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { GET } from '@/app/api/search/autocomplete+api';

describe('GET /api/search/autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchMixedAutocomplete.mockResolvedValue([
      {
        place_id: 'poi-1',
        title: 'Dhanmondi 27',
        subtitle: 'Dhanmondi, Dhaka',
        point_type: 'dropoff_point',
        category: 'area',
        source: 'vendor',
        session_token: 'token-uuid-1234',
      },
      {
        place_id: 'poi-2',
        title: 'Dhanmondi Lake',
        subtitle: 'Dhanmondi, Dhaka',
        point_type: 'building',
        category: 'park',
        source: 'first_party',
      },
    ]);
  });

  it('returns suggestions with session tokens and metadata', async () => {
    const req = new Request(
      'http://localhost/api/search/autocomplete?q=dhanmondi%2027&lat=23.7785&lng=90.4180',
      {
        headers: { 'Accept-Language': 'en-US' },
      },
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].title).toBe('Dhanmondi 27');
    expect(body.suggestions[0].session_token).toBe('token-uuid-1234');
    expect(mockSearchMixedAutocomplete).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'dhanmondi 27',
        proximity: { lat: 23.7785, lng: 90.418 },
        language: 'en',
      }),
    );
  });

  it('returns empty suggestions when query is shorter than 2 chars', async () => {
    const req = new Request('http://localhost/api/search/autocomplete?q=a');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.suggestions).toEqual([]);
    expect(mockSearchMixedAutocomplete).not.toHaveBeenCalled();
  });

  it('detects Bengali language preference from header', async () => {
    const req = new Request('http://localhost/api/search/autocomplete?q=গুলশান', {
      headers: { 'Accept-Language': 'bn-BD,bn;q=0.9' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockSearchMixedAutocomplete).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'bn',
      }),
    );
  });
});

