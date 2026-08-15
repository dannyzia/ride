/**
 * Overflow-safe money arithmetic helpers.
 *
 * All `*_bdt` columns are integer paisa. The naive `Math.floor(a * pct / 100)`
 * pattern multiplies first, and `paisa * percentage-points` can exceed
 * Number.MAX_SAFE_INTEGER at extreme (or attacker-supplied) values. These
 * helpers compute the same floor semantics with BigInt so the intermediate
 * product can never lose precision.
 */

/**
 * floor(paisa * percent / 100) — the platform-commission / percentage-of-money
 * computation. `percent` is a percentage from a numeric(5,2) column such as
 * 15 or 15.5. Converts the percentage to integer basis points internally so
 * both operands are exact integers before multiplying with BigInt.
 */
export function percentOf(paisa: number, percent: number): number {
  const basisPoints = Math.round(percent * 100);
  if (
    !Number.isSafeInteger(paisa) ||
    !Number.isSafeInteger(basisPoints)
  ) {
    // Fallback for non-integer operands — preserves Math.floor semantics.
    return Math.floor((paisa * percent) / 100);
  }
  return Number((BigInt(paisa) * BigInt(basisPoints)) / 10000n);
}
