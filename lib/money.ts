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
/**
 * Parse a taka amount typed by a human into integer paisa.
 *
 * `Math.round` is load-bearing: `12.30 * 100` is 1230.0000000000002 in IEEE-754
 * and every `*_bdt` API schema rejects non-integers, so truncating with
 * `parseInt` (silently drops decimals) or multiplying raw (silently 400s) are
 * both wrong. Non-numeric input is `NaN`, which callers must reject before
 * sending.
 */
export function takaToPaisa(taka: string | number): number {
  const n = typeof taka === "number" ? taka : parseFloat(taka.replace(/,/g, ""));
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100);
}

/** Integer paisa → taka number, for editable inputs. */
export function paisaToTaka(paisa: number): number {
  return Math.round(paisa) / 100;
}

/** Integer paisa → display string (e.g. 1250 → "৳12.50"). */
export function formatBdt(paisa: number): string {
  return `৳${(Math.round(paisa) / 100).toFixed(2)}`;
}

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
