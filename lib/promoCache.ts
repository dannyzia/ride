/**
 * In-memory staged promo cache.
 * When a rider validates a promo via POST /api/promo/redeem, the promo is "staged"
 * here with a TTL. The actual promo_redemptions row is written when the ride is created.
 *
 * ⚠️ SINGLE-INSTANCE REQUIREMENT (audit T-7): staging lives in process memory, so
 * correctness depends on the Expo API server running as ONE instance. INSTANCE_COUNT=1
 * is hard-enforced only for utils-server (it exits at boot otherwise); the API server's
 * equivalent is by convention — do NOT horizontally scale the API server without
 * replacing this Map with a shared store. Same caveat applies to the global promo cap
 * (check-then-consume on promo_redemptions).
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
