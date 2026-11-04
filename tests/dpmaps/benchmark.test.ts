/**
 * tests/dpmaps/benchmark.test.ts
 *
 * Unit tests for dpMaps Gate 1A and Gate 1B evaluation algorithms.
 */

import { describe, it, expect } from '@jest/globals';
import {
  relativeErrorPct,
  median,
  evaluateRoutingGate1A,
  evaluateSearchGate1B,
  generateCanonicalSamples,
} from '@/scripts/benchmark-dpmaps';

describe('dpMaps benchmark gate evaluator', () => {
  describe('relativeErrorPct', () => {
    it('calculates relative percentage correctly', () => {
      expect(relativeErrorPct(110, 100)).toBeCloseTo(10.0);
      expect(relativeErrorPct(90, 100)).toBeCloseTo(10.0);
      expect(relativeErrorPct(100, 100)).toBe(0);
      expect(relativeErrorPct(100, 0)).toBe(0);
    });
  });

  describe('median', () => {
    it('calculates median for odd and even sets', () => {
      expect(median([1, 2, 3])).toBe(2);
      expect(median([1, 2, 3, 4])).toBe(2.5);
      expect(median([5])).toBe(5);
      expect(median([])).toBe(0);
    });
  });

  describe('evaluateRoutingGate1A', () => {
    it('passes when errors are within bounds', () => {
      const samples = [
        { predictedDurationS: 100, actualDurationS: 105, predictedDistanceM: 1000, actualDistanceM: 1010 },
        { predictedDurationS: 200, actualDurationS: 210, predictedDistanceM: 2000, actualDistanceM: 2020 },
      ];
      const res = evaluateRoutingGate1A(samples);
      expect(res.passed).toBe(true);
      expect(res.medianDurationErrorPct).toBeLessThanOrEqual(12.0);
      expect(res.medianDistanceErrorPct).toBeLessThanOrEqual(3.0);
    });

    it('fails when duration error exceeds 12%', () => {
      const samples = [
        { predictedDurationS: 100, actualDurationS: 120, predictedDistanceM: 1000, actualDistanceM: 1010 },
      ];
      const res = evaluateRoutingGate1A(samples);
      expect(res.passed).toBe(false);
      expect(res.medianDurationErrorPct).toBeGreaterThan(12.0);
    });
  });

  describe('evaluateSearchGate1B', () => {
    it('passes when Top-1 is >= 92% and MRR is >= 0.88', () => {
      const samples = Array(100).fill({ top1Matched: true, rank: 1 });
      const res = evaluateSearchGate1B(samples);
      expect(res.passed).toBe(true);
      expect(res.top1AccuracyPct).toBe(100);
      expect(res.mrr).toBe(1);
    });

    it('fails when Top-1 is below 92%', () => {
      const samples = [
        { top1Matched: true, rank: 1 },
        { top1Matched: false, rank: 2 },
      ]; // 50% Top-1
      const res = evaluateSearchGate1B(samples);
      expect(res.passed).toBe(false);
      expect(res.top1AccuracyPct).toBe(50);
    });
  });

  describe('canonical Dhaka suite', () => {
    it('canonical sample passes both Gate 1A and Gate 1B', () => {
      const { routingSamples, searchSamples } = generateCanonicalSamples();
      const r1a = evaluateRoutingGate1A(routingSamples);
      const s1b = evaluateSearchGate1B(searchSamples);

      expect(r1a.passed).toBe(true);
      expect(s1b.passed).toBe(true);
    });
  });
});

