/**
 * lib/hotspot.ts — hotspot detection invariants.
 *
 * Covers: zone_tier resolution (tag→tier), reading freshness edges,
 * 3-beat hysteresis state machine (streak counting, reset on zone change
 * and on null readings, refresh-window rate-limited flips), and the
 * zone_heat fallback when the point resolves outside every zone.
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock('@/src/db', () => ({
  db: { select: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/platformConfig', () => ({
  getPlan05Int: jest.fn(async () => 10),
}));
// h3-js cannot load under the jest-expo TextDecoder polyfill (repo-wide
// known issue — see lib/__tests__/pickupQuote.test.ts); only the res-8
// cell cache key is needed here.
jest.mock('@/lib/h3', () => ({
  getH3CellRes8: jest.fn(() => 'cell-res8'),
}));

import { db } from '@/src/db';
import {
  tierFromTag,
  tagFromTier,
  isReadingFresh,
  applyHysteresis,
  initialHysteresisState,
  getHotspotZone,
  HYSTERESIS_BEATS,
  REFRESH_WINDOW_MS,
} from '../hotspot';

function nowAt(iso: string): Date {
  return new Date(iso);
}

describe('tierFromTag / tagFromTier', () => {
  it('maps zone_heat tags to tiers', () => {
    expect(tierFromTag('cold')).toBe('low');
    expect(tierFromTag('neutral')).toBe('medium');
    expect(tierFromTag('hot')).toBe('high');
  });

  it('round-trips tier → tag → tier', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(tierFromTag(tagFromTier(tier))).toBe(tier);
    }
  });
});

describe('isReadingFresh', () => {
  const now = nowAt('2026-09-06T04:00:00Z');

  it('accepts readings at the window boundary and inside it', () => {
    expect(isReadingFresh('2026-09-06T03:50:00Z', now, 10)).toBe(true);
    expect(isReadingFresh('2026-09-06T03:59:59Z', now, 10)).toBe(true);
  });

  it('rejects readings older than the window', () => {
    expect(isReadingFresh('2026-09-06T03:49:59Z', now, 10)).toBe(false);
    expect(isReadingFresh('2026-09-05T04:00:00Z', now, 10)).toBe(false);
  });

  it('rejects invalid timestamps', () => {
    expect(isReadingFresh('not-a-date', now, 10)).toBe(false);
  });
});

describe('applyHysteresis — 3-beat streaks', () => {
  const T0 = 1_700_000_000_000;

  it('does not flip on a single reading (one beat)', () => {
    const { zoneId, state } = applyHysteresis(initialHysteresisState(), 'zone-a', T0);
    expect(zoneId).toBeNull();
    expect(state.beats).toBe(1);
    expect(state.candidateZoneId).toBe('zone-a');
  });

  it('does not flip after two consecutive readings', () => {
    let state = initialHysteresisState();
    state = applyHysteresis(state, 'zone-a', T0).state;
    const { zoneId } = applyHysteresis(state, 'zone-a', T0 + 1_000);
    expect(zoneId).toBeNull();
  });

  it('flips on the third consecutive reading', () => {
    let state = initialHysteresisState();
    state = applyHysteresis(state, 'zone-a', T0).state;
    state = applyHysteresis(state, 'zone-a', T0 + 1_000).state;
    const { zoneId, state: flipped } = applyHysteresis(state, 'zone-a', T0 + 2_000);
    expect(zoneId).toBe('zone-a');
    expect(flipped.stableZoneId).toBe('zone-a');
    expect(flipped.beats).toBe(0);
    expect(flipped.lastFlipMs).toBe(T0 + 2_000);
  });

  it('resets the streak when the candidate zone changes mid-streak', () => {
    let state = initialHysteresisState();
    state = applyHysteresis(state, 'zone-a', T0).state;
    state = applyHysteresis(state, 'zone-b', T0 + 1_000).state;
    expect(state.beats).toBe(1);
    expect(state.candidateZoneId).toBe('zone-b');
    const { zoneId } = applyHysteresis(state, 'zone-b', T0 + 2_000);
    expect(zoneId).toBeNull(); // only 2 beats on zone-b
  });

  it('a reading equal to the stable zone resets the candidate streak', () => {
    let state = initialHysteresisState();
    state = applyHysteresis(state, 'zone-a', T0).state;
    state = applyHysteresis(state, 'zone-a', T0 + 1_000).state;
    state = applyHysteresis(state, 'zone-a', T0 + 2_000).state; // flip → stable zone-a
    // Stray candidate zone-b for one beat, then back in sync.
    state = applyHysteresis(state, 'zone-b', T0 + 3_000).state;
    expect(state.beats).toBe(1);
    const { zoneId, state: after } = applyHysteresis(state, 'zone-a', T0 + 4_000);
    expect(zoneId).toBe('zone-a');
    expect(after.beats).toBe(0);
    expect(after.candidateZoneId).toBeNull();
  });

  it('a null reading resets the candidate streak but keeps the stable zone', () => {
    let state = initialHysteresisState();
    state = applyHysteresis(state, 'zone-a', T0).state;
    state = applyHysteresis(state, 'zone-a', T0 + 1_000).state;
    const { zoneId, state: after } = applyHysteresis(state, null, T0 + 2_000);
    expect(zoneId).toBeNull(); // stable not yet set
    expect(after.beats).toBe(0);
    expect(after.candidateZoneId).toBeNull();

    // And a locked-in stable zone survives null readings.
    let locked = after;
    locked = applyHysteresis(locked, 'zone-a', T0 + 3_000).state; // beat 1
    locked = applyHysteresis(locked, 'zone-a', T0 + 4_000).state; // beat 2
    locked = applyHysteresis(locked, 'zone-a', T0 + 5_000).state; // beat 3 → flip
    expect(locked.stableZoneId).toBe('zone-a');
    const { zoneId: kept } = applyHysteresis(locked, null, T0 + 6_000);
    expect(kept).toBe('zone-a');
  });
});

describe('applyHysteresis — 10-minute refresh window', () => {
  const T0 = 1_700_000_000_000;

  function buildStable(zone: string): { state: ReturnType<typeof initialHysteresisState>; flipMs: number } {
    let state = initialHysteresisState();
    state = applyHysteresis(state, zone, T0).state;
    state = applyHysteresis(state, zone, T0 + 1_000).state;
    const flipped = applyHysteresis(state, zone, T0 + 2_000);
    return { state: flipped.state, flipMs: T0 + 2_000 };
  }

  it('blocks a completed streak from flipping inside the refresh window', () => {
    const { state } = buildStable('zone-a');
    let s = state;
    s = applyHysteresis(s, 'zone-b', T0 + 60_000).state;
    s = applyHysteresis(s, 'zone-b', T0 + 120_000).state;
    const { zoneId, state: blocked } = applyHysteresis(s, 'zone-b', T0 + 180_000);
    expect(blocked.beats).toBe(HYSTERESIS_BEATS);
    expect(zoneId).toBe('zone-a'); // still attached to zone-a
  });

  it('applies the accumulated flip at the next refresh boundary', () => {
    const { state, flipMs } = buildStable('zone-a');
    let s = state;
    s = applyHysteresis(s, 'zone-b', flipMs + 60_000).state;
    s = applyHysteresis(s, 'zone-b', flipMs + 120_000).state;
    s = applyHysteresis(s, 'zone-b', flipMs + 180_000).state;
    const { zoneId } = applyHysteresis(s, 'zone-b', flipMs + REFRESH_WINDOW_MS);
    expect(zoneId).toBe('zone-b');
  });
});

describe('getHotspotZone — zone_heat fallback', () => {
  const ZONE_ID = '44444444-4444-4444-4444-444444444444';
  const NOW = nowAt('2026-09-06T04:00:00Z');

  type Row = Record<string, unknown>;

  /** Chainable select mock returning `rows` after where/orderBy/limit. */
  function mockSelect(rows: Row[]): void {
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = jest.fn(() => chain);
      chain.innerJoin = jest.fn(() => chain);
      chain.where = jest.fn(() => chain);
      chain.orderBy = jest.fn(() => chain);
      chain.limit = jest.fn(async () => rows);
      return chain;
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when zone_heat has no rows at all', async () => {
    mockSelect([]);
    const zone = await getHotspotZone(23.81, 90.41, {
      now: NOW,
      freshnessMinutes: 10,
      noCache: true,
    });
    expect(zone).toBeNull();
  });

  it('returns null when the only reading is stale (outside the 10-min window)', async () => {
    mockSelect([
      {
        zone_id: ZONE_ID,
        name: 'Mirpur',
        tag: 'hot',
        score: '0.8100',
        computed_at: nowAt('2026-09-06T03:40:00Z'), // 20 min old
      },
    ]);
    const zone = await getHotspotZone(23.81, 90.41, {
      now: NOW,
      freshnessMinutes: 10,
      noCache: true,
    });
    expect(zone).toBeNull();
  });

  it('returns the most recent fresh reading as fallback (tier resolved from tag)', async () => {
    mockSelect([
      {
        zone_id: ZONE_ID,
        name: 'Mirpur',
        tag: 'hot',
        score: '0.8100',
        computed_at: nowAt('2026-09-06T03:55:00Z'), // 5 min old — fresh
      },
    ]);
    const zone = await getHotspotZone(23.81, 90.41, {
      now: NOW,
      freshnessMinutes: 10,
      noCache: true,
    });
    expect(zone).not.toBeNull();
    expect(zone!.tier).toBe('high');
    expect(zone!.zone_name).toBe('Mirpur');
    expect(zone!.score).toBeCloseTo(0.81, 4);
  });

  it('returns null when the freshest reading is not fresh', async () => {
    mockSelect([
      {
        zone_id: ZONE_ID,
        name: 'Mirpur',
        tag: 'cold',
        score: '0.1000',
        computed_at: nowAt('2026-09-05T04:00:00Z'), // a day old
      },
    ]);
    const zone = await getHotspotZone(23.81, 90.41, {
      now: NOW,
      freshnessMinutes: 10,
      noCache: true,
    });
    expect(zone).toBeNull();
  });

  it('serves repeat lookups from the cell cache until invalidated', async () => {
    mockSelect([
      {
        zone_id: ZONE_ID,
        name: 'Mirpur',
        tag: 'neutral',
        score: '0.4000',
        computed_at: nowAt('2026-09-06T03:55:00Z'),
      },
    ]);
    const first = await getHotspotZone(23.81, 90.41, {
      now: NOW,
      freshnessMinutes: 10,
    });
    expect(first!.tier).toBe('medium');
    const selectsAfterFirst = (db.select as jest.Mock).mock.calls.length;
    const second = await getHotspotZone(23.81, 90.41, {
      now: NOW,
      freshnessMinutes: 10,
    });
    expect(second!.tier).toBe('medium');
    // Second call served from cache — no additional DB traffic.
    expect((db.select as jest.Mock).mock.calls.length).toBe(selectsAfterFirst);
  });
});
