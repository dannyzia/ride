export function applySurge(totalBdt: number, surgeMultiplier: number) {
  const surgeFeeBdt = surgeMultiplier > 1.0
    ? Math.round(totalBdt * (surgeMultiplier - 1.0))
    : 0;
  return {
    multiplier: surgeMultiplier,
    surgeFeeBdt,
    totalWithSurge: totalBdt + surgeFeeBdt,
  };
}
