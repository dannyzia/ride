export function validateMinPerKm(
  systemPerKmBdt: number,
  minPerKmBdt: number,
  ratios?: { minRatio?: number; maxRatio?: number },
): { valid: boolean; error?: string } {
  if (minPerKmBdt === 0) return { valid: true };

  const minRatio = ratios?.minRatio ?? 0.7;
  const maxRatio = ratios?.maxRatio ?? 1.5;

  const lo = Math.floor(systemPerKmBdt * minRatio);
  const hi = Math.ceil(systemPerKmBdt * maxRatio);

  if (minPerKmBdt < lo || minPerKmBdt > hi) {
    return {
      valid: false,
      error: `min_per_km_bdt must be between ${lo} and ${hi} (${Math.round(minRatio * 100)}%–${Math.round(maxRatio * 100)}% of system rate)`,
    };
  }

  return { valid: true };
}
