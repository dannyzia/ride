export function validateMinPerKm(systemPerKmBdt: number, minPerKmBdt: number): { valid: boolean; error?: string } {
  if (minPerKmBdt === 0) return { valid: true };

  const lo = Math.floor(systemPerKmBdt * 0.70);
  const hi = Math.ceil(systemPerKmBdt * 1.50);

  if (minPerKmBdt < lo || minPerKmBdt > hi) {
    return {
      valid: false,
      error: `min_per_km_bdt must be between ${lo} and ${hi} (70%–150% of system rate)`,
    };
  }

  return { valid: true };
}
