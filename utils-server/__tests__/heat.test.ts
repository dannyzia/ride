/**
 * Zone heat engine — pure math unit tests (utils-server/heat.ts).
 * Lights up the previously-dead helpers now imported by scheduler jobs
 * 35/36, plus the sample-statistics helpers (median/quantile) used by the
 * Phase E/F/G monitors.
 */
import {
  ewmaUpdate,
  ewmaAlpha,
  percentileRank,
  blendScore,
  heatTag,
  suggestScore,
  toPercentileRanks,
  median,
  quantile,
} from "../heat";

describe("ewmaUpdate / ewmaAlpha", () => {
  test("alpha of 1 fully replaces the previous value", () => {
    expect(ewmaUpdate(5, 10, 1)).toBe(10);
  });

  test("alpha of 0 keeps the previous value", () => {
    expect(ewmaUpdate(5, 10, 0)).toBe(5);
  });

  test("blends observation and previous linearly", () => {
    // 0.25 × 10 + 0.75 × 2 = 2.5 + 1.5 = 4
    expect(ewmaUpdate(2, 10, 0.25)).toBe(4);
  });

  test("alpha from halflife: h = 1 → α = 0.5", () => {
    expect(ewmaAlpha(1)).toBeCloseTo(0.5, 10);
  });

  test("alpha from halflife 30 matches the scheduler's previous inline formula", () => {
    expect(ewmaAlpha(30)).toBeCloseTo(1 - Math.exp(-Math.LN2 / 30), 12);
  });

  test("non-positive halflife → α = 1 (no smoothing)", () => {
    expect(ewmaAlpha(0)).toBe(1);
    expect(ewmaAlpha(-5)).toBe(1);
  });
});

describe("percentileRank", () => {
  test("empty input → 0", () => {
    expect(percentileRank([], 5)).toBe(0);
  });

  test("lowest value → low percentile, highest → 100-scale rank", () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentileRank(sorted, 1)).toBe(0);
    expect(percentileRank(sorted, 3)).toBe(40);
    expect(percentileRank(sorted, 5)).toBe(80);
  });

  test("ties count as not-below (strict less-than)", () => {
    expect(percentileRank([2, 2, 2], 2)).toBe(0);
  });
});

describe("blendScore", () => {
  test("40% baseline / 60% live — framework §4 default", () => {
    expect(blendScore(80, 40, 0.4)).toBeCloseTo(0.4 * 0.8 + 0.6 * 0.4);
  });

  test("clamps to [0, 1]", () => {
    expect(blendScore(200, 200, 0.4)).toBe(1);
    expect(blendScore(-100, -100, 0.4)).toBe(0);
  });
});

describe("heatTag", () => {
  test("hot >= 66, cold < 33, neutral between (default cutoffs)", () => {
    expect(heatTag(0.7, 66, 33)).toBe("hot");
    expect(heatTag(0.66, 66, 33)).toBe("hot");
    expect(heatTag(0.5, 66, 33)).toBe("neutral");
    expect(heatTag(0.32, 66, 33)).toBe("cold");
  });
});

describe("suggestScore", () => {
  test("divides by 1 + idle drivers", () => {
    expect(suggestScore(0.8, 0)).toBe(0.8);
    expect(suggestScore(0.8, 3)).toBeCloseTo(0.2);
  });
});

describe("toPercentileRanks", () => {
  test("returns one rank per input value", () => {
    expect(toPercentileRanks([10, 20, 30])).toEqual([0, 33, 67]);
  });
});

describe("median", () => {
  test("odd count → middle value", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  test("even count → average of the two middle values", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  test("empty → 0", () => {
    expect(median([])).toBe(0);
  });
});

describe("quantile (linear interpolation, type 7)", () => {
  test("p90 of 1..10 → 9.1", () => {
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1, 10);
  });

  test("interpolates between adjacent order statistics", () => {
    // pos = (4-1) × 0.5 = 1.5 → (2 + 3) / 2 = 2.5
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  test("clamps q outside [0, 1]", () => {
    expect(quantile([5, 10], 2)).toBe(10);
    expect(quantile([5, 10], -1)).toBe(5);
  });

  test("empty → 0", () => {
    expect(quantile([], 0.9)).toBe(0);
  });
});
