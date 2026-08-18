import {
  demandPressure,
  normalizeIntensities,
  surgeRatio,
  pickSurgeMultiplier,
  DEFAULT_SURGE_THRESHOLDS,
} from '../hotspots';

describe('demandPressure', () => {
  it('is 0.5 for balanced demand/supply', () => {
    expect(demandPressure(10, 10)).toBe(0.5);
  });

  it('is demand-heavy (above 0.5) when demand outpaces supply', () => {
    expect(demandPressure(10, 2)).toBeCloseTo(10 / 12, 6);
  });

  it('saturates at 1 when there is demand but zero supply', () => {
    expect(demandPressure(5, 0)).toBe(1);
  });

  it('is 0 for supply-only and for no activity at all', () => {
    expect(demandPressure(0, 5)).toBe(0);
    expect(demandPressure(0, 0)).toBe(0);
  });
});

describe('normalizeIntensities', () => {
  it('stretches active zones to 0..1, preserving relative order', () => {
    const result = normalizeIntensities([0.2, 0.5, 0.8]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(0.5, 6);
    expect(result[2]).toBe(1);
  });

  it('keeps inactive zones at 0 and only stretches zones with activity', () => {
    // Active = [0.3, 0.9]; span 0.6 → 0.3→0, 0.9→1; the 0s stay 0.
    expect(normalizeIntensities([0, 0.3, 0, 0.9])).toEqual([0, 0, 0, 1]);
  });

  it('returns all-equal values unchanged (nothing to stretch against)', () => {
    expect(normalizeIntensities([0.7, 0.7])).toEqual([0.7, 0.7]);
    expect(normalizeIntensities([0.8])).toEqual([0.8]);
  });

  it('returns all-zero and empty lists unchanged', () => {
    expect(normalizeIntensities([0, 0, 0])).toEqual([0, 0, 0]);
    expect(normalizeIntensities([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [0.1, 0.4, 0.7];
    normalizeIntensities(input);
    expect(input).toEqual([0.1, 0.4, 0.7]);
  });
});

describe('surgeRatio', () => {
  it('is demand / supply', () => {
    expect(surgeRatio(9, 3)).toBe(3);
  });

  it('saturates to raw demand when supply is zero (never divides by zero)', () => {
    expect(surgeRatio(5, 0)).toBe(5);
    expect(surgeRatio(0, 0)).toBe(0);
  });

  it('is 0 when there is no demand', () => {
    expect(surgeRatio(0, 5)).toBe(0);
  });
});

describe('pickSurgeMultiplier', () => {
  it('returns 1.0 when no threshold is cleared', () => {
    expect(pickSurgeMultiplier(0.5)).toBe(1.0);
    expect(pickSurgeMultiplier(1.0)).toBe(1.0);
    expect(pickSurgeMultiplier(1.19)).toBe(1.0);
  });

  it('uses strictly-greater comparison at every tier boundary', () => {
    // Exactly 1.2 and 2.0 do NOT clear their own tiers; exactly 3.0 skips 2.0.
    expect(pickSurgeMultiplier(1.2)).toBe(1.0);
    expect(pickSurgeMultiplier(2.0)).toBe(1.25);
    expect(pickSurgeMultiplier(3.0)).toBe(1.5);
  });

  it('picks the highest cleared tier', () => {
    expect(pickSurgeMultiplier(1.21)).toBe(1.25);
    expect(pickSurgeMultiplier(2.1)).toBe(1.5);
    expect(pickSurgeMultiplier(5)).toBe(2.0);
  });

  it('handles custom threshold tables and empty tables', () => {
    const custom = [{ ratio: 1, multiplier: 1.1 }];
    expect(pickSurgeMultiplier(1.5, custom)).toBe(1.1);
    expect(pickSurgeMultiplier(0.5, custom)).toBe(1.0);
    expect(pickSurgeMultiplier(2, [])).toBe(1.0);
  });

  it('does not mutate the threshold table (sorts a copy)', () => {
    const table = [
      { ratio: 2, multiplier: 1.5 },
      { ratio: 3, multiplier: 2.0 },
    ];
    pickSurgeMultiplier(3.5, table);
    expect(table).toEqual([
      { ratio: 2, multiplier: 1.5 },
      { ratio: 3, multiplier: 2.0 },
    ]);
  });

  it('defaults to the same tiers the scheduler seeds', () => {
    expect(DEFAULT_SURGE_THRESHOLDS).toEqual([
      { ratio: 3, multiplier: 2.0 },
      { ratio: 2, multiplier: 1.5 },
      { ratio: 1.2, multiplier: 1.25 },
    ]);
  });
});

describe('surge decision chain', () => {
  it('maps a demand/supply count pair through ratio → multiplier', () => {
    // 9 demand / 3 supply → ratio 3 → strictly above 2.0 but not 3.0 → 1.5.
    expect(pickSurgeMultiplier(surgeRatio(9, 3))).toBe(1.5);
    // 5 demand / 0 supply → ratio 5 → clears the top tier.
    expect(pickSurgeMultiplier(surgeRatio(5, 0))).toBe(2.0);
    // 2 demand / 10 supply → ratio 0.2 → no surge.
    expect(pickSurgeMultiplier(surgeRatio(2, 10))).toBe(1.0);
  });
});
