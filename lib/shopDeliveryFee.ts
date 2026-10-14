/**
 * shopDeliveryFee.ts — distance-tiered delivery fee quote (plan 27 §12).
 *
 * Seeds-not-constants: every rate is fresh-read from platform_config at call
 * time via requireConfigInt — a missing key propagates (500), it never
 * invents a zero. The quote is SNAPSHOTTED onto the order + delivery rows at
 * placement (§15 R-A9): mid-flight admin edits never change a placed order.
 *
 * Distance is the straight-line haversine between the shop's stored pickup
 * coordinates and the customer's dropoff — the tier boundary is a 3 km
 * radius circle (owner default), not a routed road distance.
 */
import { requireConfigInt } from './platformConfig';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometers (always >= 0). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface DeliveryFeeQuote {
  /** Integer paisa — the customer-paid fee for this order. */
  fee_bdt: number;
  /** Straight-line shop → dropoff distance, rounded to 2dp for display. */
  distance_km: number;
  tier: 'within' | 'beyond';
}

/**
 * Quote the delivery fee for a shop → dropoff leg. All three config keys are
 * read fresh in one pass; distances exactly at the radius count as WITHIN.
 */
export async function quoteDeliveryFee(opts: {
  shopLat: number;
  shopLng: number;
  dropLat: number;
  dropLng: number;
}): Promise<DeliveryFeeQuote> {
  const [radiusKm, withinBdt, beyondBdt] = await Promise.all([
    requireConfigInt('delivery_fee_tier_radius_km'),
    requireConfigInt('delivery_fee_within_3km_bdt'),
    requireConfigInt('delivery_fee_beyond_3km_bdt'),
  ]);

  const km = haversineKm(opts.shopLat, opts.shopLng, opts.dropLat, opts.dropLng);
  const within = km <= radiusKm;
  return {
    fee_bdt: within ? withinBdt : beyondBdt,
    distance_km: Math.round(km * 100) / 100,
    tier: within ? 'within' : 'beyond',
  };
}
