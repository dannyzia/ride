import { db } from '../src/db';
import { drivers, dispatchOffers, systemConfig, pricing } from '../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getH3Ring } from '../lib/h3';
import { getDriversInCells } from './h3Index';
import { checkDriverEligibility } from '../lib/vehicleTypes';
import { haversineKm } from '../lib/fareCalc';
import { logger } from '../lib/logger';

const W_DISTANCE    = 0.40;
const W_RATING      = 0.30;
const W_ACCEPTANCE  = 0.20;
const W_AVAILABILITY= 0.10;

export interface ScoredDriver {
  driverId: string;
  score: number;
}

export async function isDispatchPaused(): Promise<boolean> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'dispatch_paused'));
  return row?.value === 'true';
}

export async function scoreAndBatchDrivers(
  rideId: string,
  originLat: number,
  originLng: number,
  vehicleType: string,
  zoneId: string,
  batchSize = 5,
): Promise<ScoredDriver[]> {
  const cells = getH3Ring(originLat, originLng, 2);
  const candidateIds = getDriversInCells(cells, vehicleType);
  if (!candidateIds.length) return [];

  const [pricingRow] = await db.select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(
      eq(pricing.vehicle_type, vehicleType as any),
      eq(pricing.zone_id, zoneId),
      eq(pricing.is_active, true),
    ))
    .limit(1);
  const systemPerKmBdt = pricingRow?.per_km_bdt ?? 0;

  const driverRows = await db.select({
    id: drivers.id,
    last_location_lat: drivers.last_location_lat,
    last_location_lng: drivers.last_location_lng,
    rating: drivers.rating,
    acceptance_rate: drivers.acceptance_rate,
    last_location_at: drivers.last_location_at,
    completed_rides_count: drivers.completed_rides_count,
    min_per_km_bdt: drivers.min_per_km_bdt,
    vehicle_type: drivers.vehicle_type,
  }).from(drivers).where(
    and(
      eq(drivers.is_online, true),
      eq(drivers.status, 'active'),
      eq(drivers.vehicle_type, vehicleType as any),
      inArray(drivers.id, candidateIds),
    )
  );

  const existingOffers = await db.select({ driver_id: dispatchOffers.driver_id })
    .from(dispatchOffers).where(eq(dispatchOffers.ride_id, rideId));
  const alreadyOffered = new Set(existingOffers.map(o => o.driver_id));

  const scored: ScoredDriver[] = [];
  for (const d of driverRows) {
    if (alreadyOffered.has(d.id)) continue;

    const { eligible } = checkDriverEligibility(vehicleType as any, {
      completed_rides_count: d.completed_rides_count,
      rating: parseFloat(d.rating?.toString() ?? '5'),
    });
    if (!eligible) continue;

    if (d.min_per_km_bdt != null && systemPerKmBdt < d.min_per_km_bdt) {
      await db.insert(dispatchOffers).values({
        ride_id:         rideId,
        driver_id:       d.id,
        batch_index:     -1,
        sent_at:         new Date(),
        outcome:         'filtered' as any,
        filtered_reason: 'min_per_km',
      }).onConflictDoNothing();
      continue;
    }

    const distKm = haversineKm(
      originLat, originLng,
      parseFloat(d.last_location_lat?.toString() ?? '0'),
      parseFloat(d.last_location_lng?.toString() ?? '0'),
    );
    const distScore    = Math.max(0, 1 - distKm / 5);
    const ratingScore  = (parseFloat(d.rating?.toString() ?? '5') - 1) / 4;
    const acceptScore  = parseFloat(d.acceptance_rate?.toString() ?? '100') / 100;
    const availScore   = 1.0;

    const score = W_DISTANCE * distScore + W_RATING * ratingScore + W_ACCEPTANCE * acceptScore + W_AVAILABILITY * availScore;
    scored.push({ driverId: d.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, batchSize);
}

export async function updateDriverAcceptanceRate(driverId: string): Promise<void> {
  try {
    const recentOffers = await db.select({ outcome: dispatchOffers.outcome })
      .from(dispatchOffers)
      .where(and(
        eq(dispatchOffers.driver_id, driverId),
        inArray(dispatchOffers.outcome, ['accepted', 'rejected', 'expired'] as any),
      ))
      .orderBy(dispatchOffers.sent_at)
      .limit(50);

    if (recentOffers.length === 0) return;

    const accepted = recentOffers.filter(o => o.outcome === 'accepted').length;
    const rate = Math.round((accepted / recentOffers.length) * 100);

    await db.update(drivers).set({
      acceptance_rate: String(rate),
    }).where(eq(drivers.id, driverId));

    logger.debug('[dispatch] acceptance rate updated', { driverId, rate, total: recentOffers.length });
  } catch (e: any) {
    logger.error('[dispatch] acceptance rate update failed', { driverId, error: e.message });
  }
}

