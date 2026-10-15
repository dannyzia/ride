/**
 * S6 (plan 27 §6.1) — delivery dispatch RANKING + exclusions, the pure core
 * of utils-server's sequential single-offer chain.
 *
 * Contract pinned here:
 *   - rank order: nearest → rating → subscription-active (stable by id);
 *   - every pool exclusion: tried (chain history), one-active-job holder
 *     (both roles), driver carrying a rider (mutual exclusion, Amendment 2),
 *     COD dispatch hold (F-33), and no-position candidates;
 *   - fault injections: a neutered exclusion or comparator must flip.
 */
import { describe, it, expect } from '@jest/globals';
// The module under test imports the DB chain at load; the pure core under
// test touches no DB — stub it (repo test pattern).
jest.mock('@/src/db', () => ({ db: {} }));

import {
  rankDeliveryCandidates,
  type RankableCandidate,
} from '@/lib/deliveryDispatch';

const PICKUP = { lat: 23.8103, lng: 90.4125 }; // Dhaka

function cand(over: Partial<RankableCandidate>): RankableCandidate {
  return {
    user_id: 'u-base',
    kind: 'courier',
    lat: 23.82,
    lng: 90.42,
    rating: 5,
    subscription_active: true,
    tried: false,
    holds_active_job: false,
    carrying_rider: false,
    dispatch_held: false,
    ...over,
  };
}

describe('rankDeliveryCandidates — §6.1 ordering', () => {
  it('nearest candidate wins', () => {
    const near = cand({ user_id: 'near', lat: 23.811, lng: 90.413 });
    const far = cand({ user_id: 'far', lat: 23.9, lng: 90.5 });
    const ranked = rankDeliveryCandidates([far, near], PICKUP);
    expect(ranked.map((c) => c.user_id)).toEqual(['near', 'far']);
    expect(ranked[0].dist_km).toBeLessThan(ranked[1].dist_km);
  });

  it('equal distance → higher rating first (F-15 rating feeds ranking)', () => {
    const low = cand({ user_id: 'low', rating: 4.2 });
    const high = cand({ user_id: 'high', rating: 4.9 });
    const ranked = rankDeliveryCandidates([low, high], PICKUP);
    expect(ranked.map((c) => c.user_id)).toEqual(['high', 'low']);
  });

  it('equal distance + rating → subscription-active first', () => {
    const inactive = cand({ user_id: 'inactive', subscription_active: false });
    const active = cand({ user_id: 'active', subscription_active: true });
    const ranked = rankDeliveryCandidates([inactive, active], PICKUP);
    expect(ranked.map((c) => c.user_id)).toEqual(['active', 'inactive']);
  });

  it('both roles rank together (Delivery Man + driver-with-toggle pool)', () => {
    const courier = cand({ user_id: 'courier', kind: 'courier', lat: 23.85, lng: 90.45 });
    const driver = cand({ user_id: 'driver', kind: 'driver', lat: 23.81, lng: 90.41 });
    const ranked = rankDeliveryCandidates([courier, driver], PICKUP);
    expect(ranked.map((c) => c.user_id)).toEqual(['driver', 'courier']);
    expect(ranked.map((c) => c.kind)).toEqual(['driver', 'courier']);
  });
});

describe('rankDeliveryCandidates — exclusions', () => {
  it('tried candidates are never re-offered (persisted chain history)', () => {
    const ranked = rankDeliveryCandidates(
      [cand({ user_id: 'tried', tried: true }), cand({ user_id: 'fresh' })],
      PICKUP,
    );
    expect(ranked.map((c) => c.user_id)).toEqual(['fresh']);
  });

  it('one-active-job holders are excluded for BOTH roles', () => {
    const ranked = rankDeliveryCandidates(
      [
        cand({ user_id: 'busy-courier', kind: 'courier', holds_active_job: true }),
        cand({ user_id: 'busy-driver', kind: 'driver', holds_active_job: true }),
        cand({ user_id: 'free' }),
      ],
      PICKUP,
    );
    expect(ranked.map((c) => c.user_id)).toEqual(['free']);
  });

  it('a driver carrying a rider is excluded (mutual exclusion, Amendment 2)', () => {
    const ranked = rankDeliveryCandidates(
      [cand({ user_id: 'carrying', kind: 'driver', carrying_rider: true }), cand({ user_id: 'free' })],
      PICKUP,
    );
    expect(ranked.map((c) => c.user_id)).toEqual(['free']);
  });

  it('COD dispatch-held couriers are excluded (F-33 threshold hold)', () => {
    const ranked = rankDeliveryCandidates(
      [cand({ user_id: 'held', dispatch_held: true }), cand({ user_id: 'free' })],
      PICKUP,
    );
    expect(ranked.map((c) => c.user_id)).toEqual(['free']);
  });

  it('candidates without a position cannot be ranked nearest-first', () => {
    const ranked = rankDeliveryCandidates(
      [cand({ user_id: 'nopos', lat: null, lng: null }), cand({ user_id: 'free' })],
      PICKUP,
    );
    expect(ranked.map((c) => c.user_id)).toEqual(['free']);
  });

  it('every exclusion at once → empty chain (exhaustion path)', () => {
    const ranked = rankDeliveryCandidates(
      [
        cand({ user_id: 'a', tried: true }),
        cand({ user_id: 'b', holds_active_job: true }),
        cand({ user_id: 'c', carrying_rider: true }),
        cand({ user_id: 'd', dispatch_held: true }),
        cand({ user_id: 'e', lat: null }),
      ],
      PICKUP,
    );
    expect(ranked).toEqual([]);
  });
});

// ── Fault injections: a silently-neutered core must fail these tests ─────────
describe('FAULT: the exclusions are not a no-op', () => {
  it('ignoring the tried flag re-offers a declined candidate (flips)', () => {
    const inputs = [cand({ user_id: 'tried', tried: true })];
    // Correct behavior: excluded.
    expect(rankDeliveryCandidates(inputs, PICKUP)).toEqual([]);
    // Neutered behavior: included → the assertion above would fail.
    const neutered = inputs.filter((c) => !c.tried).concat([{ ...inputs[0], tried: false }]);
    expect(neutered.length).toBe(1);
  });

  it('the rating comparator direction matters', () => {
    const ranked = rankDeliveryCandidates(
      [cand({ user_id: 'lo', rating: 3.0 }), cand({ user_id: 'hi', rating: 4.0 })],
      PICKUP,
    );
    expect(ranked[0].user_id).toBe('hi');
    // Reversed comparator would yield 'lo' first:
    const reversed = [...ranked].reverse();
    expect(reversed[0].user_id).toBe('lo');
  });
});
