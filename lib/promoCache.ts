/**
 * In-memory staged promo cache.
 * When a rider validates a promo via POST /api/promo/redeem, the promo is "staged"
 * here with a TTL. The actual promo_redemptions row is written when the ride is created.
 * Since INSTANCE_COUNT=1, an in-memory Map is sufficient (no Redis needed).
 */

interface StagedPromo {
  promoCodeId: string;
  riderId: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  maxDiscountBdt: number | null;
  minSpendBdt: number | null;
  stagedAt: number;
}

const STAGED_TTL_MS = 10 * 60 * 1000; // 10 minutes

const stagedPromos = new Map<string, StagedPromo>(); // key = riderId

export function stagePromo(riderId: string, promo: Omit<StagedPromo, 'stagedAt'>): void {
  stagedPromos.set(riderId, { ...promo, stagedAt: Date.now() });
}

export function getStagedPromo(riderId: string): StagedPromo | null {
  const staged = stagedPromos.get(riderId);
  if (!staged) return null;
  if (Date.now() - staged.stagedAt > STAGED_TTL_MS) {
    stagedPromos.delete(riderId);
    return null;
  }
  return staged;
}

export function clearStagedPromo(riderId: string): void {
  stagedPromos.delete(riderId);
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of stagedPromos) {
    if (now - val.stagedAt > STAGED_TTL_MS) stagedPromos.delete(key);
  }
}, 5 * 60 * 1000);
