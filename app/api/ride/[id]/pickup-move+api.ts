import { db } from '@/src/db';
import { users, rides, pricing } from '@/src/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { validatePickupZone } from '@/lib/zone';
import { calculateFare, calculateV6Fare, haversineKm, type V6PricingRow } from '@/lib/fareCalc';
import { detectOriginCity, isIntercity } from '@/lib/cityBoundary';
import { splitRoute } from '@/lib/routeSplit';
import { getRouteDistance } from '@/lib/barikoi';
import {
  getFareFrameworkConfig,
  parseConfigBool,
  parseConfigNumber,
} from '@/lib/fareFrameworkConfig';
import { PICKUP_QUOTE_CONFIG_KEYS, pickupQuoteRange } from '@/lib/pickupQuote';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import * as errors from '@/lib/errors';

/**
 * Phase F pin-edit rules (plan §7 "Pin-edit rules — new endpoint").
 *
 * POST /api/ride/[id]/pickup-move — rider-authenticated, ride in
 * pending|dispatching. Body { lat, lng, address }.
 *
 * - Block check FIRST: pickup_requote_count > pickup_max_forced_requotes
 *   → 409 pickup_move_blocked (client offers cancel only).
 * - New pin validated against the operational zones exactly like
 *   ride/request (same error codes).
 * - ≤ pickup_pin_tolerance_m (locked 250 m) from the previous pin →
 *   SILENT re-quote: the dispatch chain keeps running (utils-server is a
 *   separate process; the in-flight pipeline re-reads pickup coords from
 *   the ride row at the next candidate — no notify needed).
 * - Beyond tolerance → FORCED requote: increment pickup_requote_count,
 *   stamp pickup_requoted_at (resets the free-cancel grace window —
 *   cancel/cancel-preview anchor on GREATEST(created_at,
 *   pickup_requoted_at)), and fire-and-forget notify utils-server to
 *   abort the current chain so it re-enters dispatch with fresh coords.
 *   The notify is non-fatal: if the endpoint is missing (404) or
 *   utils-server is down, the between-offers ride-status re-check is the
 *   fallback. Already-billed drivers are skipped on re-entry via the
 *   unique indexes — never re-billed.
 *
 * Drop zone is NOT re-resolved: only the pickup moves, dropoff is
 * unchanged.
 */

const MOVABLE_STATUSES = ['pending', 'dispatching'] as const;

const pickupMoveSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).max(255),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });
    }
    const rideId = id;

    const supabaseUser = await verifySupabaseToken(request);

    const parsed = await parseJsonBody(request, pickupMoveSchema);
    if (!parsed.ok) return parsed.response;

    const { lat, lng, address } = parsed.data;

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db
      .select({
        user_id: rides.user_id,
        status: rides.status,
        origin_latitude: rides.origin_latitude,
        origin_longitude: rides.origin_longitude,
        destination_latitude: rides.destination_latitude,
        destination_longitude: rides.destination_longitude,
        vehicle_type: rides.vehicle_type,
        zone_id: rides.zone_id,
        pricing_id: rides.pricing_id,
        pickup_requote_count: rides.pickup_requote_count,
        pickup_requoted_at: rides.pickup_requoted_at,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (ride.user_id !== user.id) {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    if (ride.status !== 'pending' && ride.status !== 'dispatching') {
      return Response.json(
        { error: 'invalid_state', message: `Pickup cannot be moved in status: ${ride.status}` },
        { status: 409 },
      );
    }

    // ── Pin-edit config (locked constants, admin-tunable) ────────────
    const fwCfg = await getFareFrameworkConfig([
      'pickup_pin_tolerance_m',
      'pickup_max_forced_requotes',
      ...PICKUP_QUOTE_CONFIG_KEYS,
    ]);
    const pinToleranceM = parseConfigNumber(fwCfg.pickup_pin_tolerance_m, 250);
    const maxForcedRequotes = parseConfigNumber(fwCfg.pickup_max_forced_requotes, 2);
    const pickupFeeEnabled = parseConfigBool(fwCfg.pickup_fee_enabled);

    // Block check FIRST — beyond the forced-requote budget the pickup pin
    // is locked; the only remaining action is cancelling the ride.
    if (ride.pickup_requote_count > maxForcedRequotes) {
      return Response.json(
        {
          error: 'pickup_move_blocked',
          message: 'Pickup location can no longer be changed. Please cancel the ride.',
        },
        { status: 409 },
      );
    }

    // ── Zone validation for the NEW pin (mirrors ride/request) ───────
    const zoneCheck = await validatePickupZone(lat, lng);
    if (!zoneCheck.valid) {
      if (zoneCheck.error === 'zones_not_configured') {
        return Response.json({ error: 'zones_not_configured', message: 'No operational zones configured' }, { status: 503 });
      }
      return Response.json(
        {
          error: zoneCheck.error ?? 'outside_zone',
          message: 'Pickup location is outside the operational zone',
        },
        { status: 422 },
      );
    }
    if (!zoneCheck.zone?.id) {
      return Response.json({ error: 'zones_not_configured', message: 'No operational zones configured' }, { status: 503 });
    }
    const quoteZoneId = zoneCheck.zone.id;

    // ── Tolerance check against the previous pin ─────────────────────
    const prevLat = Number(ride.origin_latitude);
    const prevLng = Number(ride.origin_longitude);
    const distanceM = haversineKm(prevLat, prevLng, lat, lng) * 1000;
    const forced = distanceM > pinToleranceM;

    const destLat = Number(ride.destination_latitude);
    const destLng = Number(ride.destination_longitude);

    // ── Trip fare re-quote (mirrors ride/request's route + fare calc) ──
    const route = await getRouteDistance(lat, lng, destLat, destLng).catch(() => null);
    const totalDistanceKm =
      route?.distanceKm ?? haversineKm(lat, lng, destLat, destLng);

    const { origin_city, origin_city_polygon } = await detectOriginCity({ lat, lng });
    const intercity = origin_city_polygon
      ? isIntercity({ lat: destLat, lng: destLng }, origin_city_polygon)
      : false;

    let insideKm = 0;
    let outsideKm = 0;
    if (intercity && origin_city_polygon) {
      const split = await splitRoute(
        { lat, lng },
        { lat: destLat, lng: destLng },
        origin_city_polygon,
      );
      insideKm = split.inside_km;
      outsideKm = split.outside_km;
    } else {
      insideKm = totalDistanceKm;
      outsideKm = 0;
    }

    // The ride keeps its request-time pricing row (pricing_id) — a pin
    // move re-quotes distance/duration, it does not re-resolve pricing.
    const [activePricing] = await db
      .select()
      .from(pricing)
      .where(eq(pricing.id, ride.pricing_id))
      .limit(1);
    if (!activePricing) {
      return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 422 });
    }

    const fareBreakdown = calculateFare(
      {
        base_fare_bdt: activePricing.base_fare_bdt,
        per_km_bdt: activePricing.per_km_bdt,
        intercity_per_km_bdt: activePricing.intercity_per_km_bdt ?? 0,
        per_min_bdt: activePricing.per_min_bdt,
        floor_length_km: Number(activePricing.floor_length_km ?? 0),
        floor_min: activePricing.floor_min ?? 0,
        brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(
          activePricing.platform_commission_percent ?? 0,
        ),
      },
      insideKm,
      0,
      undefined,
      outsideKm,
      origin_city,
      intercity,
    );

    // v6 shadow (PATCH 1)
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
        platform_commission_percent: 0, // v6 = 0% commission (subscription-only)
      } as V6PricingRow,
      trip_km: insideKm + outsideKm,
      ride_time_min: 0, // pickup-move — re-estimate on actual ride
      night_mult: 1.0,
      grace_min: activePricing.free_wait_minutes ?? 3,
      wait_min: 0, // no wait at pickup-move
      pickup_fee_bdt: 0, // pickup fee computed at completion
      zone_fee_bdt: 0, // Stage 0: zone_fee_enabled=false
      inside_km: insideKm,
      outside_km: outsideKm,
      origin_city,
      is_intercity: intercity,
    });

    // ── Pickup fee range refresh (only when the fee is enabled) ──────
    const pickupQuote = pickupFeeEnabled
      ? await pickupQuoteRange({
          zoneId: quoteZoneId,
          vehicleType: ride.vehicle_type,
          pickupLat: lat,
          pickupLng: lng,
          fareBeforePickupPaisa: fareBreakdown.total_bdt,
          cfg: fwCfg,
        }).catch(() => null)
      : null;

    // ── One transaction: origin move + fare/polyline refresh + forced
    // requote bookkeeping. The conditional UPDATE (status still
    // pending|dispatching) is the race guard against a concurrent status
    // transition between the read above and this write. ────────────────
    let requoteCount = -1;
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(rides)
        .set({
          origin_latitude: String(lat),
          origin_longitude: String(lng),
          origin_address: address,
          updated_at: new Date(),
          distance_km: String(fareBreakdown.distance_km),
          fare_breakdown: fareBreakdown,
          route_polyline: route?.polyline ?? null,
          ...(pickupFeeEnabled
            ? {
                pickup_fee_state: pickupQuote ? ('range' as const) : null,
                pickup_fee_low_bdt: pickupQuote?.lowPaisa ?? null,
                pickup_fee_high_bdt: pickupQuote?.highPaisa ?? null,
              }
            : {}),
          // v6 shadow (PATCH 1)
          fare_v6_shadow: v6FareBreakdown as any,
          fare_v6_shadow_computed_at: new Date(),
          ...(forced
            ? {
                pickup_requote_count: ride.pickup_requote_count + 1,
                pickup_requoted_at: new Date(),
              }
            : {}),
        })
        .where(and(eq(rides.id, rideId), inArray(rides.status, [...MOVABLE_STATUSES])))
        .returning({ pickup_requote_count: rides.pickup_requote_count });

      requoteCount = updated?.pickup_requote_count ?? -1;
    });

    if (requoteCount < 0) {
      return Response.json(
        { error: 'invalid_state', message: `Cannot move pickup: ride is no longer pending or dispatching` },
        { status: 409 },
      );
    }

    logger.info('[ride/pickup-move] pickup moved', {
      rideId,
      forced,
      distanceM,
      requoteCount,
    });

    // ── Forced requote: abort the in-flight dispatch chain ───────────
    // Fire-and-forget, must never fail the move itself. A 404 (endpoint
    // not deployed yet) or utils-server downtime is swallowed — the
    // pipeline's between-offers ride-status re-check is the fallback.
    if (forced) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? '3001';
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        fetch(`http://127.0.0.1:${wsPort}/internal/ride/pickup-moved`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${internalSecret}`,
          },
          signal: AbortSignal.timeout(3_000),
          body: JSON.stringify({ ride_id: rideId }),
        }).catch((e) =>
          logger.error('[ride/pickup-move] WS chain-abort notify failed', {
            rideId,
            error: errors.getErrorMessage(e),
          }),
        );
      }
    }

    return Response.json({
      ok: true,
      requote_forced: forced,
      requote_count: requoteCount,
      fare_breakdown: {
        total_bdt: fareBreakdown.total_bdt,
        distance_km: fareBreakdown.distance_km,
        duration_min: route?.durationMin ?? null,
        ...(pickupQuote
          ? {
              pickup_fee_low_bdt: pickupQuote.lowPaisa,
              pickup_fee_high_bdt: pickupQuote.highPaisa,
            }
          : {}),
      },
    });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[ride/pickup-move] error', e);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
