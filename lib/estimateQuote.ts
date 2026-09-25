/**
 * Plan-05 W1: shared projection from a /api/ride/estimate response to an
 * advisory fare quote in taka. Used by ScheduleRideSheet's pre-booking
 * preview. Pure function — no React, no RN, no fare math (the estimate
 * endpoint remains the single fare authority; this only reads its response).
 */

/**
 * Pull the advisory quote (taka) out of an estimate response — the
 * vehicle-matched estimate when a vehicle_type was requested, else the
 * first (estimate sorts cheapest-first). Integer paisa → taka at display.
 * Returns null for missing/malformed payloads (advisory: caller hides it).
 */
export function extractQuoteTaka(
  data: unknown,
  vehicleType?: string,
): number | null {
  const estimates = (data as { estimates?: { vehicle_type?: unknown; total_bdt?: unknown }[] })
    ?.estimates;
  if (!Array.isArray(estimates) || estimates.length === 0) return null;
  const est =
    (vehicleType && estimates.find((e) => e.vehicle_type === vehicleType)) ||
    estimates[0];
  const totalPaisa = est?.total_bdt;
  return typeof totalPaisa === "number" && totalPaisa >= 0
    ? totalPaisa / 100
    : null;
}
