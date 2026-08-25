/**
 * Release gate: zero-sentinel pricing rows are never offered.
 *
 * A pricing row with base_fare_bdt <= 0 AND per_km_bdt <= 0 is a sentinel
 * (REQUIRES PRODUCT INPUT) — riders must not see a fare of 0.
 *
 * Used by estimate+api.ts browse-mode filter and single-type validation.
 */
export function isOfferablePricing(row: {
  base_fare_bdt: number;
  per_km_bdt: number;
}): boolean {
  return row.base_fare_bdt > 0 || row.per_km_bdt > 0;
}
