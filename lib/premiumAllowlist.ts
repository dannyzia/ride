/**
 * Server-side premium allowlist resolver.
 *
 * Queries vehicle_premium_allowlist with case-normalized matching and returns
 * a boolean for the pure classifier. This function is server-only — it uses
 * Drizzle and must NOT be imported by React Native screens or utils-server.
 *
 * Matching semantics:
 * - brand-only rows (model IS NULL) match the entire brand
 * - brand+model rows match a specific model
 * - case-insensitive matching via LOWER()
 * - only active rows are considered
 */
import { db } from '@/src/db';
import { vehiclePremiumAllowlist } from '@/src/db/schema';
import { eq, sql, and, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Check if a brand/model combination is on the premium allowlist.
 *
 * @param brand - Vehicle manufacturer (e.g. "Toyota")
 * @param model - Vehicle model (e.g. "Premio") — may be null/undefined
 * @returns true if the combination matches any active allowlist entry
 */
export async function isPremiumAllowlisted(
  brand: string,
  model?: string | null,
): Promise<boolean> {
  const normalizedBrand = brand.trim().toLowerCase();
  const normalizedModel = model?.trim().toLowerCase() ?? null;

  try {
    // 1. Check brand+model specific match (if model provided)
    if (normalizedModel) {
      const [modelMatch] = await db
        .select({ id: vehiclePremiumAllowlist.id })
        .from(vehiclePremiumAllowlist)
        .where(
          and(
            eq(vehiclePremiumAllowlist.is_active, true),
            sql`LOWER(${vehiclePremiumAllowlist.brand}) = ${normalizedBrand}`,
            sql`LOWER(${vehiclePremiumAllowlist.model}) = ${normalizedModel}`,
          ),
        )
        .limit(1);

      if (modelMatch) return true;
    }

    // 2. Check brand-only match (model IS NULL = whole brand)
    const [brandMatch] = await db
      .select({ id: vehiclePremiumAllowlist.id })
      .from(vehiclePremiumAllowlist)
      .where(
        and(
          eq(vehiclePremiumAllowlist.is_active, true),
          sql`LOWER(${vehiclePremiumAllowlist.brand}) = ${normalizedBrand}`,
          isNull(vehiclePremiumAllowlist.model),
        ),
      )
      .limit(1);

    return !!brandMatch;
  } catch (err) {
    // Don't let allowlist query failures block registration —
    // fall back to not-premium (safe default)
    logger.error('[premium-allowlist] query failed', { brand, model, error: String(err) });
    return false;
  }
}
