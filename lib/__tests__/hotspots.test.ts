import { demandPressure, normalizeIntensities } from '../hotspots';

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
