/**
 * Zone Heat Score Engine — pure math, unit-testable.
 *
 * Blended score = w_baseline × baseline_pct + (1 - w_baseline) × live_pctile
 * Tags: hot (score >= hot_pct), cold (score < cold_pct), neutral otherwise.
 *
 * Framework §4: dispatch levers are suggestive — no penalty for ignoring.
 */

/** EWMA update: new_value = α × observation + (1 - α) × previous */
export function ewmaUpdate(
  previous: number,
  observation: number,
  alpha: number,
): number {
  return alpha * observation + (1 - alpha) * previous;
}

/**
 * Compute EWMA alpha from halflife in minutes.
 * α = 1 - e^(-ln2 / halflife)
 */
export function ewmaAlpha(halflifeMinutes: number): number {
  if (halflifeMinutes <= 0) return 1;
  return 1 - Math.exp(-Math.LN2 / halflifeMinutes);
}

/**
 * Percentile rank of a value within a sorted array (0-100 scale).
 * Returns the percentile position of `value` in the sorted `values` array.
 */
export function percentileRank(sortedValues: number[], value: number): number {
  if (sortedValues.length === 0) return 0;
  let countBelow = 0;
  for (const v of sortedValues) {
    if (v < value) countBelow++;
    else break;
  }
  return Math.round((countBelow / sortedValues.length) * 100);
}

/**
 * Blend baseline and live percentiles into a single score (0-1 scale).
 * Framework §4: 40% trailing baseline / 60% live EWMA.
 */
export function blendScore(
  baselinePct: number,
  livePctile: number,
  baselineWeight: number,
): number {
  const score = baselineWeight * (baselinePct / 100) + (1 - baselineWeight) * (livePctile / 100);
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score));
}

/** Zone heat tag based on score thresholds. */
export function heatTag(
  score: number,
  hotPct: number,
  coldPct: number,
): 'hot' | 'neutral' | 'cold' {
  // hotPct and coldPct are on 0-100 scale, score is 0-1
  const scorePct = score * 100;
  if (scorePct >= hotPct) return 'hot';
  if (scorePct < coldPct) return 'cold';
  return 'neutral';
}

/**
 * Suggest score = score / (1 + idle_driver_count).
 * Recomputed on every API call reading fresh idle_driver_count from zone_heat.
 * Framework §4 Lever 0: relative-density keeps two halves pointed the same
 * direction — ranking purely by absolute heat would oversaturate the hottest zone.
 */
export function suggestScore(
  score: number,
  idleDriverCount: number,
): number {
  return score / (1 + idleDriverCount);
}

/**
 * Normalize a list of values to 0-100 percentile ranks.
 * Returns an array of the same length with percentile positions.
 */
export function toPercentileRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => percentileRank(sorted, v));
}

/**
 * Median of a sample (average of the two middle values for even n).
 * Empty input returns 0.
 */
export function median(values: number[]): number {
  return quantile(values, 0.5);
}

/**
 * Quantile of a sample with linear interpolation (type 7): the Dawdle
 * guard's p90 and the decline-monitor's median decline rate use this.
 * q is a 0-1 fraction. Empty input returns 0.
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}
