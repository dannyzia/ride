import { db } from '@/src/db';
import { users, pricing, preferences, systemConfig, zoneHeat } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { validatePickupZone } from '@/lib/zone';
import { calculateFare, haversineKm } from '@/lib/fareCalc';
import { isStage1Plus } from '@/lib/fareFrameworkConfig';
import { calculateV6Fare, type V6PricingRow } from '@/lib/fareCalc';

import { getAvailableDiscounts } from '@/lib/discountEngine';
import { detectOriginCity, isIntercity } from '@/lib/cityBoundary';
import { splitRoute } from '@/lib/routeSplit';
import { getRouteDistance } from '@/lib/barikoi';
import { getFareFrameworkConfig, parseConfigBool } from '@/lib/fareFrameworkConfig';
import { PICKUP_QUOTE_CONFIG_KEYS, pickupQuoteRange } from '@/lib/pickupQuote';
import { VEHICLE_TYPE_VALUES, VEHICLE_TYPES } from '@/lib/vehicleTypes';
import { isOfferablePricing } from '@/lib/pricingGate';
import { loadSpeedTableFromConfig, type EtaSpeedTable, timeBucket, etaSpeedKmh, computeEtaMinutes } from '@/lib/eta';
import { parseJsonBody } from '@/lib/parseBody';
import { toUtcIso } from '@/lib/time';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

let etaTableCache: EtaSpeedTable | null = null;
let etaTableExpiry = 0;

async function getEtaTable(): Promise<EtaSpeedTable> {
  if (etaTableCache && Date.now() < etaTableExpiry) return etaTableCache;
  etaTableCache = await loadSpeedTableFromConfig(async (key) => {
    const [row] = await db.select({ value: systemConfig.value })
      .from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
    return row?.value ?? null;
  });
  etaTableExpiry = Date.now() + 5 * 60 * 1000;
  return etaTableCache;
}

const estimateSchema = z.object({
  pickup_lat:     z.number().min(-90).max(90),
  pickup_lng:     z.number().min(-180).max(180),
  dropoff_lat:    z.number().min(-90).max(90),
  dropoff_lng:    z.number().min(-180).max(180),
  vehicle_type:   z.enum(VEHICLE_TYPE_VALUES).optional(),
  preference_ids: z.array(z.string().uuid()).max(10).optional(),
  upfront_tip_bdt: z.number().int().min(0).max(20000).optional(),
  stops: z.array(z.object({ lat: z.number(), lng: z.number(), address: z.string() })).max(2).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [rider] = await db.select({ id: users.id, total_rides: users.total_rides }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!rider) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const parsed = await parseJsonBody(request, estimateSchema);
    if (!parsed.ok) return parsed.response;
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, vehicle_type, preference_ids, stops } = parsed.data;
    const _upfrontTip = parsed.data.upfront_tip_bdt;

    // Zone check
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      if (zoneCheck.error === 'zones_not_configured') {
        return Response.json({ error: 'zones_not_configured', message: 'No operational zones configured' }, { status: 503 });
      }
      return Response.json({ error: zoneCheck.error ?? 'outside_zone', message: 'Pickup location is outside the operational zone' }, { status: 422 });
    }
    if (!zoneCheck.zone?.id) {
      return Response.json({ error: 'zones_not_configured', message: 'No operational zones configured' }, { status: 503 });
    }
    const zoneId = zoneCheck.zone.id;

    // Route-based distance with Haversine fallback
    const route = await getRouteDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng).catch(() => null);
    let totalDistanceKm = route?.distanceKm ?? haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // ── Multi-leg distance when stops are provided ──────────────────────
    // Filter out stops with 0,0 coords (unset) to avoid haversine to Null Island
    const validStops = (stops ?? []).filter(s => s.lat !== 0 && s.lng !== 0);
    if (validStops.length > 0) {
      const waypoints = [
        { lat: pickup_lat, lng: pickup_lng },
        ...validStops,
        { lat: dropoff_lat, lng: dropoff_lng },
      ];
      let multiLegKm = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        multiLegKm += haversineKm(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
      }
      totalDistanceKm = multiLegKm;
    }

    // City detection and intercity route splitting
    const { origin_city, origin_city_polygon } = await detectOriginCity({ lat: pickup_lat, lng: pickup_lng });
    const intercity = origin_city_polygon ? isIntercity({ lat: dropoff_lat, lng: dropoff_lng }, origin_city_polygon) : false;

    let insideKm = 0;
    let outsideKm = 0;

    if (intercity && origin_city_polygon) {
      const split = await splitRoute(
        { lat: pickup_lat, lng: pickup_lng },
        { lat: dropoff_lat, lng: dropoff_lng },
        origin_city_polygon,
      );
      insideKm = split.inside_km;
      outsideKm = split.outside_km;
    } else {
      insideKm = totalDistanceKm;
      outsideKm = 0;
    }

    // Compute preference surcharge
    let preferenceSurchargeBdt = 0;
    if (preference_ids && preference_ids.length > 0) {
      const prefs = await db.select({ charge_bdt: preferences.charge_bdt })
        .from(preferences)
        .where(and(
          inArray(preferences.id, preference_ids),
          eq(preferences.is_active, true),
        ));
      preferenceSurchargeBdt = prefs.reduce((sum, p) => sum + p.charge_bdt, 0);
    }

    // ── Zone heat for traffic warning (Phase F §6) ──
    const [heatRow] = await db
      .select({ tag: zoneHeat.tag, idle_driver_count: zoneHeat.idle_driver_count })
      .from(zoneHeat)
      .where(eq(zoneHeat.zone_id, zoneId))
      .limit(1);
    const zoneHeatTag = heatRow?.tag ?? 'neutral';
    const isTrafficHeavy = zoneHeatTag === 'hot';

    // If specific vehicle type requested, return single estimate
    if (vehicle_type) {
      const [activePricing] = await db.select().from(pricing)
        .where(and(
          eq(pricing.vehicle_type, vehicle_type as any),
          eq(pricing.zone_id, zoneId),
          eq(pricing.is_active, true),
        )).limit(1);
      if (!activePricing || !isOfferablePricing(activePricing)) {
        // release gate: zero-sentinel pricing rows are never offered
        return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 422 });
      }
      const fare = calculateFare({
        base_fare_bdt:        activePricing.base_fare_bdt,
        per_km_bdt:           activePricing.per_km_bdt,
        intercity_per_km_bdt: activePricing.intercity_per_km_bdt ?? 0,
        per_min_bdt:          activePricing.per_min_bdt,
        floor_length_km:      Number(activePricing.floor_length_km ?? 0),
        floor_min:            activePricing.floor_min ?? 0,
        brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(activePricing.platform_commission_percent ?? 0),
      }, insideKm, 0, undefined, outsideKm, origin_city, intercity);
      const stage1 = await isStage1Plus();
      const v6FareBreakdown = calculateV6Fare({
        pricing: {
          base_fare_bdt: activePricing.base_fare_bdt,
          base_km: Number(activePricing.base_km ?? 0),
          initiation_minutes: activePricing.initiation_minutes ?? 4,
          per_km_bdt: activePricing.per_km_bdt,
          intercity_per_km_bdt: activePricing.intercity_per_km_bdt ?? 0,
          per_min_bdt: activePricing.per_min_bdt,
          floor_length_km: Number(activePricing.floor_length_km ?? 0),
          floor_min: activePricing.floor_min ?? 0,
          brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
          platform_commission_percent: 0,
        } as V6PricingRow,
        trip_km: insideKm + outsideKm,
        ride_time_min: 0,
        night_mult: 1.0,
        grace_min: activePricing.free_wait_minutes ?? 3,
        wait_min: 0,
        pickup_fee_bdt: 0,
        zone_fee_bdt: 0,
        inside_km: insideKm,
        outside_km: outsideKm,
        origin_city,
        is_intercity: intercity,
      });
      const authoritative = stage1 ? v6FareBreakdown : fare;

      // ── Pickup fee range (Phase F quote state 1; ruling 5: ≤2 route
      // calls for the quote — nearest + p75-reference — separate from the
      // trip route call above). Disabled (Stage 0) → null → no fields.
      // Computed after `fare` — the %-of-fare backstop needs the trip total.
      const fwCfg = await getFareFrameworkConfig(PICKUP_QUOTE_CONFIG_KEYS);
      const pickupQuote = parseConfigBool(fwCfg.pickup_fee_enabled)
        ? await pickupQuoteRange({
            zoneId,
            vehicleType: vehicle_type,
            pickupLat: pickup_lat,
            pickupLng: pickup_lng,
            fareBeforePickupPaisa: fare.total_bdt,
            cfg: fwCfg,
          }).catch(() => null)
        : null;

      // ── Available discounts ──
      const availableDiscounts = await getAvailableDiscounts({
        riderId: rider.id,
        totalRides: rider.total_rides ?? 0,
        fareTotalBdt: fare.total_bdt,
        zoneId,
      });

      const vtDef = VEHICLE_TYPES.find(v => v.key === vehicle_type);
      const driverFare = authoritative.total_bdt + preferenceSurchargeBdt;
      const etaTable = await getEtaTable();
      const etaBucket = timeBucket(new Date());
      const etaMin = computeEtaMinutes(totalDistanceKm, etaSpeedKmh(vehicle_type, etaBucket, etaTable));
      // §1.4: quote_valid_until — 5 minutes from now; client silently
      // re-estimates when expired and shows refreshed fare.
      const quoteValidUntil = new Date(Date.now() + 5 * 60 * 1000);

      return Response.json({
        estimates: [{
          vehicle_type,
          display_en:  vtDef?.display_en ?? vehicle_type,
          display_bn:  vtDef?.display_bn ?? vehicle_type,
          seats:       vtDef?.seats ?? 1,
          fare_breakdown: authoritative,
          base_fare_bdt:        authoritative.base_fare_bdt,
          distance_charge_bdt:  authoritative.distance_charge_bdt,
          total_bdt:            authoritative.total_bdt,
          distance_km:          authoritative.distance_km,
          preference_surcharge_bdt: preferenceSurchargeBdt,
          driver_fare_bdt: driverFare,
          rider_payable_bdt: driverFare,
          eta_minutes: etaMin,
         available_discounts: availableDiscounts,
        // Advisory pickup fee range — ADVISORY ONLY: totals above EXCLUDE it
        // (fee becomes real at accept; prevents double-count bugs).
        ...(pickupQuote ? {
          pickup_fee_low_bdt: pickupQuote.lowPaisa,
          pickup_fee_high_bdt: pickupQuote.highPaisa,
          pickup_fee_range_low_confidence: pickupQuote.lowConfidence,
        } : {}),
        // Non-binding fare range (Phase F §6): ±15% of estimated total.
        // Labeled as estimate — never a contractual offer.
        fare_range_low_bdt: Math.round(authoritative.total_bdt * 0.85),
        fare_range_high_bdt: Math.round(authoritative.total_bdt * 1.15),
        }],
        distance_km: totalDistanceKm,
        preferences_applied: preference_ids ?? [],
        quote_valid_until: toUtcIso(quoteValidUntil),
        // Traffic warning (Phase F §6): hot zone → "traffic is heavy"
        ...(isTrafficHeavy ? {
          traffic_warning: true,
          traffic_message: 'Traffic is heavy now — trip may take longer and cost more.',
        } : {}),
      });
    }

    // Return all vehicle types
    // release gate: zero-sentinel pricing rows are never offered
    const allPricings = await db.select().from(pricing)
      .where(and(eq(pricing.zone_id, zoneId), eq(pricing.is_active, true)));
    const pricings = allPricings.filter(isOfferablePricing);

    const etaTable = await getEtaTable();
    const etaBucket = timeBucket(new Date());

    // ── Rider pass discount for multi-vehicle ──

    // Pickup fee range config (ruling 5: multi-vehicle path = haversine × 1.4
    // per pool, 0 route calls). One config read shared by every pool.
    const fwCfg = await getFareFrameworkConfig(PICKUP_QUOTE_CONFIG_KEYS);
    const pickupFeeEnabled = parseConfigBool(fwCfg.pickup_fee_enabled);
    const stage1 = await isStage1Plus();

    const estimates = await Promise.all(pricings.map(async (p) => {
      const fare = calculateFare({
        base_fare_bdt:        p.base_fare_bdt,
        per_km_bdt:           p.per_km_bdt,
        intercity_per_km_bdt: p.intercity_per_km_bdt ?? 0,
        per_min_bdt:          p.per_min_bdt,
        floor_length_km:      Number(p.floor_length_km ?? 0),
        floor_min:            p.floor_min ?? 0,
        brta_fare_ceiling_bdt: p.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(p.platform_commission_percent ?? 0),
      }, insideKm, 0, undefined, outsideKm, origin_city, intercity);
      const v6FareBreakdown = calculateV6Fare({
        pricing: {
          base_fare_bdt: p.base_fare_bdt,
          base_km: Number(p.base_km ?? 0),
          initiation_minutes: p.initiation_minutes ?? 4,
          per_km_bdt: p.per_km_bdt,
          intercity_per_km_bdt: p.intercity_per_km_bdt ?? 0,
          per_min_bdt: p.per_min_bdt,
          floor_length_km: Number(p.floor_length_km ?? 0),
          floor_min: p.floor_min ?? 0,
          brta_fare_ceiling_bdt: p.brta_fare_ceiling_bdt,
          platform_commission_percent: 0,
        } as V6PricingRow,
        trip_km: insideKm + outsideKm,
        ride_time_min: 0,
        night_mult: 1.0,
        grace_min: p.free_wait_minutes ?? 3,
        wait_min: 0,
        pickup_fee_bdt: 0,
        zone_fee_bdt: 0,
        inside_km: insideKm,
        outside_km: outsideKm,
        origin_city,
        is_intercity: intercity,
      });
      const authoritative = stage1 ? v6FareBreakdown : fare;

      const availableDiscounts = await getAvailableDiscounts({
        riderId: rider.id,
        totalRides: rider.total_rides ?? 0,
        fareTotalBdt: fare.total_bdt,
        zoneId,
      });

      const vtDef = VEHICLE_TYPES.find(v => v.key === p.vehicle_type);
      const driverFare = authoritative.total_bdt + preferenceSurchargeBdt;
      const etaMin = computeEtaMinutes(totalDistanceKm, etaSpeedKmh(p.vehicle_type, etaBucket, etaTable));
      const pickupQuote = pickupFeeEnabled
        ? await pickupQuoteRange({
            zoneId,
            vehicleType: p.vehicle_type,
            pickupLat: pickup_lat,
            pickupLng: pickup_lng,
            fareBeforePickupPaisa: fare.total_bdt,
            cfg: fwCfg,
            haversineOnly: true,
          }).catch(() => null)
        : null;
      return {
        vehicle_type:  p.vehicle_type,
        display_en:    vtDef?.display_en ?? p.vehicle_type,
        display_bn:    vtDef?.display_bn ?? p.vehicle_type,
        seats:         vtDef?.seats ?? 1,
        fare_breakdown: authoritative,
        base_fare_bdt:        authoritative.base_fare_bdt,
        distance_charge_bdt:  authoritative.distance_charge_bdt,
        total_bdt:            authoritative.total_bdt,
        distance_km:          authoritative.distance_km,
        preference_surcharge_bdt: preferenceSurchargeBdt,
        driver_fare_bdt: driverFare,
        rider_payable_bdt: driverFare,
        eta_minutes:   etaMin,
        available_discounts: availableDiscounts,
        // Advisory pickup fee range — totals above EXCLUDE it (ruling 5).
        ...(pickupQuote ? {
          pickup_fee_low_bdt: pickupQuote.lowPaisa,
          pickup_fee_high_bdt: pickupQuote.highPaisa,
          pickup_fee_range_low_confidence: pickupQuote.lowConfidence,
        } : {}),
        // Non-binding fare range (Phase F §6): ±15% of estimated total.
        fare_range_low_bdt: Math.round(authoritative.total_bdt * 0.85),
        fare_range_high_bdt: Math.round(authoritative.total_bdt * 1.15),
      };
    }));

    estimates.sort((a, b) => a.fare_breakdown.total_bdt - b.fare_breakdown.total_bdt);

    const quoteValidUntil = new Date(Date.now() + 5 * 60 * 1000);

    return Response.json({
      estimates,
      distance_km: totalDistanceKm,
      preferences_applied: preference_ids ?? [],
      quote_valid_until: toUtcIso(quoteValidUntil),
      // Traffic warning (Phase F §6): hot zone → "traffic is heavy"
      ...(isTrafficHeavy ? {
        traffic_warning: true,
        traffic_message: 'Traffic is heavy now — trip may take longer and cost more.',
      } : {}),
    });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[ride/estimate] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
