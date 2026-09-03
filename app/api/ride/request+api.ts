import { db } from "@/src/db";
import {
  users,
  rides,
  pricing,
  promoCodes,
  promoRedemptions,
  rideStops,
  zoneHeat,
} from "@/src/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { getZoneForLocation, validatePickupZone } from "@/lib/zone";
import { calculateFare, calculateV6Fare, haversineKm, type V6PricingRow } from "@/lib/fareCalc";
import { getAvailableDiscounts } from "@/lib/discountEngine";
import { sendSms } from "@/lib/dprelay";
import { detectOriginCity, isIntercity } from "@/lib/cityBoundary";
import { splitRoute } from "@/lib/routeSplit";
import { getRouteDistance } from "@/lib/barikoi";
import { getFareFrameworkConfig, parseConfigBool } from "@/lib/fareFrameworkConfig";
import { PICKUP_QUOTE_CONFIG_KEYS, pickupQuoteRange } from "@/lib/pickupQuote";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { getStagedPromo, clearStagedPromo } from "@/lib/promoCache";
import { normalizeBdPhone, isSamePhone, isConsentFresh } from "@/lib/bookForOther";
import * as errors from "@/lib/errors";

const requestSchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  pickup_address: z.string().min(1).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(1).max(500),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  scheduled_at: z.string().datetime().optional().refine(val => !val || new Date(val) > new Date(Date.now() + 30 * 60 * 1000), {
    message: "Scheduled rides must be at least 30 minutes in the future"
  }),
  allow_downgrade: z.boolean().optional().default(false),
  selected_discount_type: z
    .enum(["intro", "promo", "pass", "none"])
    .optional(),
  selected_discount_amount_bdt: z.number().int().nonnegative().optional(),
  preference_ids: z.array(z.string().uuid()).max(10).optional(),
  secondary_rider_name: z.string().min(1).max(255).optional(),
  secondary_rider_phone: z.string().regex(/^01\d{9}$/, "Invalid Bangladesh phone number").optional(),
  secondary_rider_consent: z.boolean().optional().default(false),
  secondary_rider_consent_at: z.string().datetime().optional(),
  upfront_tip_bdt: z.number().int().min(0).max(20000).optional(),
  stops: z.array(z.object({ lat: z.number(), lng: z.number(), address: z.string().min(1).max(500) })).max(2).optional(),
  female_driver_preference: z.boolean().optional(),
  promo_code: z.string().min(1).max(50).optional(),
});

/**
 * Drop zone + heat snapshot at request time (ruling 16 measurement mode —
 * runs regardless of the fee flag). Outside all zones → null id + 'cold'
 * (ruling 13: outside the served area is the coldest possible drop;
 * never blocks the ride). Heat tag reads the live zone_heat engine,
 * defaulting to 'neutral' when no row exists yet.
 */
async function resolveDropZone(
  lat: number,
  lng: number,
): Promise<{ id: string | null; heat: "hot" | "neutral" | "cold" }> {
  try {
    const res = await getZoneForLocation(lat, lng);
    if (!res.zone?.id) return { id: null, heat: "cold" };
    const [heatRow] = await db
      .select({ tag: zoneHeat.tag })
      .from(zoneHeat)
      .where(eq(zoneHeat.zone_id, res.zone.id))
      .limit(1);
    const tag = heatRow?.tag;
    return {
      id: res.zone.id,
      heat: tag === "hot" || tag === "cold" ? tag : "neutral",
    };
  } catch {
    return { id: null, heat: "cold" };
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const uid = supabaseUser.id;

    const [user] = await db
      .select({ id: users.id, role: users.role, total_rides: users.total_rides, phone: users.phone })
      .from(users)
      .where(eq(users.auth_uid, uid))
      .limit(1);
    if (!user)
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    if (user.role !== "rider")
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const parsed = await parseJsonBody(request, requestSchema);
    if (!parsed.ok) return parsed.response;

    const {
      pickup_lat,
      pickup_lng,
      pickup_address,
      dropoff_lat,
      dropoff_lng,
      dropoff_address,
       vehicle_type,
       scheduled_at,
       allow_downgrade,
       selected_discount_type,
       selected_discount_amount_bdt,
       preference_ids,
      secondary_rider_name,
      secondary_rider_phone,
      secondary_rider_consent,
      secondary_rider_consent_at,
      upfront_tip_bdt,
      stops,
      female_driver_preference,
      promo_code,
    } = parsed.data;

    // Zone check
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
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
    const zoneId = zoneCheck.zone.id;

    // R1.3: Book-for-other hardening
    if (secondary_rider_phone) {
      // Self-phone rejection
      if (isSamePhone(user.phone, secondary_rider_phone)) {
        return Response.json(
          { error: 'self_booking', message: 'Cannot book a ride for yourself using the passenger phone field' },
          { status: 400 },
        );
      }
      // Consent required
      if (!secondary_rider_consent) {
        return Response.json(
          { error: 'consent_required', message: 'Passenger consent is required when booking for someone else' },
          { status: 400 },
        );
      }
      // Consent freshness: reject stale consent (> 10 min)
      if (!isConsentFresh(secondary_rider_consent_at, Date.now())) {
        return Response.json(
          { error: 'consent_stale', message: 'Passenger consent has expired. Please re-confirm.' },
          { status: 400 },
        );
      }
    }

    // Rate limit: 5 requests per hour
    const hourAgo = new Date(Date.now() - 3600000);
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(and(eq(rides.user_id, user.id), gte(rides.created_at, hourAgo)));
    if (Number(countResult?.count ?? 0) >= 5) {
      return Response.json({ error: 'rider_rate_limited', message: 'Rate limit exceeded for this rider' }, { status: 429 });
    }

    // Calculate distance + fare (route-based, with Haversine fallback)
    const route = await getRouteDistance(
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
    ).catch(() => null);
    let totalDistanceKm =
      route?.distanceKm ??
      haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // ── Multi-leg distance when stops are provided ──────────────────────
    if (stops && stops.length > 0) {
      const waypoints = [
        { lat: pickup_lat, lng: pickup_lng },
        ...stops,
        { lat: dropoff_lat, lng: dropoff_lng },
      ];
      let multiLegKm = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        multiLegKm += haversineKm(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
      }
      totalDistanceKm = multiLegKm;
    }

    // City detection and intercity route splitting
    const { origin_city, origin_city_polygon } = await detectOriginCity({
      lat: pickup_lat,
      lng: pickup_lng,
    });
    const intercity = origin_city_polygon
      ? isIntercity({ lat: dropoff_lat, lng: dropoff_lng }, origin_city_polygon)
      : false;

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

    const [activePricing] = await db
      .select()
      .from(pricing)
      .where(
        and(
          eq(pricing.vehicle_type, vehicle_type as any),
          eq(pricing.zone_id, zoneId),
          eq(pricing.is_active, true),
        ),
      )
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

    // ── v6 shadow (PATCH 1): compute alongside v2, log to fare_v6_shadow ──
    const v6Cfg = await getFareFrameworkConfig([
      'night_mult_value' as const,
      'night_schedule' as const,
    ]);
    const nightMultValue = parseFloat(v6Cfg.night_mult_value ?? '1.0');
    // TODO(v6): import parseNightSchedule + getNightMultiplierForDate from lib/nightSchedule
    // For Stage 0, night_mult ships at 1.0 (disabled)
    const v6NightMult = 1.0; // will use getNightMultiplierForDate when night_mult_value > 1
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
      ride_time_min: 0, // estimated — 0 at request time
      night_mult: v6NightMult,
      grace_min: activePricing.free_wait_minutes ?? 3,
      wait_min: 0, // no wait at request time
      pickup_fee_bdt: 0, // no pickup data at request time
      zone_fee_bdt: 0, // Stage 0: zone_fee_enabled=false
      inside_km: insideKm,
      outside_km: outsideKm,
      origin_city,
      is_intercity: intercity,
    });

    // ── Pickup fee range snapshot (Phase F quote state 1; ruling 5: ≤2
    // route calls for the quote — nearest + p75-reference — separate from
    // the trip route call above). Null when fee disabled (Stage 0). ──
    const fwCfg = await getFareFrameworkConfig(PICKUP_QUOTE_CONFIG_KEYS);
    const pickupQuote = parseConfigBool(fwCfg.pickup_fee_enabled)
      ? await pickupQuoteRange({
          zoneId,
          vehicleType: vehicle_type,
          pickupLat: pickup_lat,
          pickupLng: pickup_lng,
          fareBeforePickupPaisa: fareBreakdown.total_bdt,
          cfg: fwCfg,
        }).catch(() => null)
      : null;

    // ── Measurement-mode snapshots (ruling 16 — independent of fee flag):
    // drop zone + heat, and the trip polyline from the Barikoi route call
    // already made above (null when routing fell back to haversine). ──
    const dropZone = await resolveDropZone(dropoff_lat, dropoff_lng);

    // ── Available discounts ──
    const availableDiscounts = await getAvailableDiscounts({
      riderId: user.id,
      totalRides: user.total_rides ?? 0,
      fareTotalBdt: fareBreakdown.total_bdt,
      zoneId,
    });

    // ── Preference surcharge ───────────────────────────────────────────
    let preferenceSurchargeBdt = 0;
    if (preference_ids && preference_ids.length > 0) {
      const { preferences: prefsTable } = await import("@/src/db/schema");
      const {
        inArray: inArr,
        eq: eqOp,
        and: andOp,
      } = await import("drizzle-orm");
      const prefRows = await db
        .select({ charge_bdt: prefsTable.charge_bdt })
        .from(prefsTable)
        .where(
          andOp(
            inArr(prefsTable.id, preference_ids),
            eqOp(prefsTable.is_active, true),
          ),
        );
      preferenceSurchargeBdt = prefRows.reduce((s, p) => s + p.charge_bdt, 0);
    }

    // ── Validate and lock selected discount ──────────────────────────────
    const discountType = selected_discount_type ?? "none";
    const discountAmount = selected_discount_amount_bdt ?? 0;
    let appliedDiscountType: "intro" | "promo" | "pass" | "none" = "none";
    let appliedDiscountBdt = 0;
    let platformSubsidyBdt = 0;
    let promoCodeId: string | null = null;
    // M-29: the staged promo's discount shape is captured here so the
    // promoRedemptions row can be inserted INSIDE the ride transaction
    // (with the real ride_id) instead of as a pre-tx placeholder row.
    let stagedDiscountType: string | null = null;
    let stagedDiscountValue: number | null = null;
    // W-2: the rider_subscriptions row that supplied a 'pass' discount —
    // snapshotted so completion burns exactly that pass's quota, never every
    // active subscription the rider holds.
    let passSubscriptionId: string | null = null;

    if (discountType !== "none" && discountAmount > 0) {
      const match = availableDiscounts.find(
        (d) =>
          d.type === discountType &&
          d.amount_bdt === discountAmount,
      );
      if (!match) {
        return Response.json(
          {
            error: "discount_mismatch",
            message:
              "Selected discount is no longer valid. Please re-estimate.",
          },
          { status: 409 },
        );
      }

      appliedDiscountType = discountType;
      appliedDiscountBdt = discountAmount;
      if (discountType === "pass") {
        passSubscriptionId = match.subscription_id ?? null;
      }

      // L13: Wallet cannot pay for rides — wallet exists for passes/packages only.
      // All non-pass discounts are platform-subsidized (intro, promo).
      platformSubsidyBdt = discountAmount;

      // Consume staged promo if the rider selected the promo option.
      // M-29: only validate + capture the promo id here. The promoRedemptions
      // row is inserted INSIDE the ride-request transaction with the real
      // ride_id — the old pre-tx insert used a zero-UUID placeholder and left
      // an orphaned redemption (already consuming promo quota) if the ride
      // insert rolled back.
      if (discountType === "promo") {
        const staged = getStagedPromo(user.id);
        if (staged) {
          // If promo_code is provided, validate it matches the staged promo.
          // This prevents a stale or mismatched code from being applied.
          if (promo_code) {
            const [promoRow] = await db
              .select({ id: promoCodes.id, code: promoCodes.code })
              .from(promoCodes)
              .where(eq(promoCodes.id, staged.promoCodeId))
              .limit(1);
            if (!promoRow || promoRow.code !== promo_code) {
              return Response.json(
                { error: "promo_code_mismatch", message: "Promo code does not match the staged discount" },
                { status: 409 },
              );
            }
          }
          const [promoRow] = await db
            .select()
            .from(promoCodes)
            .where(eq(promoCodes.id, staged.promoCodeId))
            .limit(1);
          if (
            promoRow &&
            promoRow.is_active &&
            promoRow.expires_at > new Date()
          ) {
            promoCodeId = staged.promoCodeId;
            stagedDiscountType = staged.discountType;
            stagedDiscountValue = staged.discountValue;
          }
        }
      }
    }

    // ── Finalize amounts (driver gets FULL fare, rider pays discounted) ───
    let driverFareBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt;
    let riderPayableBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt - appliedDiscountBdt;

    // Upfront tip (100% to driver, not subject to commission)
    if (upfront_tip_bdt && upfront_tip_bdt > 0) {
      driverFareBdt += upfront_tip_bdt;
      riderPayableBdt += upfront_tip_bdt;
    }

    let rideId = "";
    let activeRideConflict = false;
    await db.transaction(async (tx) => {
      // M2: Advisory lock prevents concurrent ride creation for the same user
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ride_request_' || ${user.id}))`);

      // X-1: the "max 1 active ride" guard must run INSIDE the advisory lock.
      // A pre-tx SELECT lets two concurrent requests both pass the check and
      // both insert — two dispatch pipelines, two matches, double deductions.
      // Serialized by the lock, this re-check sees the first request's
      // committed ride and aborts the second with 409.
      const [activeRide] = await tx
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.user_id, user.id),
            sql`status IN ('pending','dispatching','matched','in_progress')`,
          ),
        )
        .limit(1);
      if (activeRide) {
        activeRideConflict = true;
        return;
      }

      const [ride] = await tx
        .insert(rides)
        .values({
          user_id: user.id,
          driver_id: null,
          zone_id: zoneId,
          pricing_id: activePricing.id,
          origin_address: pickup_address,
          destination_address: dropoff_address,
          origin_latitude: String(pickup_lat),
          origin_longitude: String(pickup_lng),
          destination_latitude: String(dropoff_lat),
          destination_longitude: String(dropoff_lng),
          vehicle_type: vehicle_type as any,
          status: "pending",
          fare_breakdown: fareBreakdown as any,
          distance_km: String(fareBreakdown.distance_km),
           scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
           promo_code_id: promoCodeId,
           promo_discount_bdt: appliedDiscountBdt,
           applied_discount_type: appliedDiscountType,
           applied_discount_bdt: appliedDiscountBdt,
           pass_subscription_id: passSubscriptionId,
           driver_fare_bdt: driverFareBdt,
          rider_payable_bdt: riderPayableBdt,
          platform_subsidy_bdt:
            platformSubsidyBdt > 0 ? platformSubsidyBdt : null,
           preference_surcharge_bdt: preferenceSurchargeBdt,
           preference_ids: preference_ids ?? [],

           // Phase F quote state 1: advisory range snapshot (all null when
           // fee disabled — no rider-facing fields exist in that mode).
           pickup_fee_state: pickupQuote ? "range" : null,
           pickup_fee_low_bdt: pickupQuote?.lowPaisa ?? null,
           pickup_fee_high_bdt: pickupQuote?.highPaisa ?? null,
           // Measurement-mode snapshots (ruling 16 — always captured).
           drop_zone_id: dropZone.id,
           drop_zone_heat: dropZone.heat,
           route_polyline: route?.polyline ?? null,

           secondary_rider_name: secondary_rider_name || null,
          secondary_rider_phone: secondary_rider_phone || null,
          is_booked_for_someone_else: !!(secondary_rider_phone || secondary_rider_name),
          upfront_tip_bdt: upfront_tip_bdt ?? 0,
          female_driver_preference: female_driver_preference ?? false,
          cancellation_fee_applied: false,

          // v6 shadow (PATCH 1): log alongside v2 fare, never billed in Stage 0
          fare_v6_shadow: v6FareBreakdown as any,
          fare_v6_shadow_computed_at: new Date(),
         })
        .returning();

      if (!ride) {
        throw new Error('ride_insert_failed');
      }
      rideId = ride.id;

      if (stops && stops.length > 0) {
        await tx.insert(rideStops).values(
          stops.map((stop: { lat: number; lng: number; address: string }, i: number) => ({
            ride_id: ride.id,
            stop_order: i + 1,
            lat: stop.lat.toString(),
            lng: stop.lng.toString(),
            address: stop.address,
          }))
        );
      }

      if (promoCodeId) {
        await tx.insert(promoRedemptions).values({
          promo_code_id: promoCodeId,
          rider_id: user.id,
          ride_id: ride.id,
          discount_type: (stagedDiscountType ?? "promo") as any,
          discount_value: stagedDiscountValue ?? appliedDiscountBdt,
          discounted_amount_bdt: appliedDiscountBdt,
          driver_fare_bdt: fareBreakdown.total_bdt + preferenceSurchargeBdt,
          rider_payable_bdt: fareBreakdown.total_bdt + preferenceSurchargeBdt - appliedDiscountBdt,
          platform_subsidy_bdt: platformSubsidyBdt,
        });
      }
    });

    if (activeRideConflict) {
      return Response.json(
        {
          error: "ride_already_active",
          message: "You already have an active ride",
        },
        { status: 409 },
      );
    }

    // The redemption row only exists once the ride committed — clear the
    // staged cache in the success path so a failed request keeps the stage
    // for a retry without re-redeeming.
    if (promoCodeId) {
      clearStagedPromo(user.id);
      logger.info("[ride/request] promo applied", {
        promoId: promoCodeId,
        discount: appliedDiscountBdt,
      });
    }

    // ── SMS to secondary rider (non-blocking) ────────────────────────
    if (secondary_rider_phone) {
      // Rate limit: max 5 book-for-other SMS per rider per hour
      const smsHourAgo = new Date(Date.now() - 3600000);
      const [smsCountResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(rides)
        .where(
          and(
            eq(rides.user_id, user.id),
            eq(rides.is_booked_for_someone_else, true),
            gte(rides.created_at, smsHourAgo),
          ),
        );
      const smsCount = Number(smsCountResult?.count ?? 0);

      if (smsCount >= 5) {
        logger.warn("[ride/request] book-for-other SMS rate limit hit", {
          userId: user.id,
          smsCount,
          rideId,
        });
      } else {
        try {
          const trackingUrl = `${process.env.EXPO_PUBLIC_SERVER_URL ?? ""}/track/${rideId}`;
          await sendSms(
            secondary_rider_phone,
            `Your ride has been booked on Ride. Track it here: ${trackingUrl}`,
          );
          logger.info("[ride/request] SMS sent to secondary rider", { rideId: rideId });
        } catch (smsErr) {
          logger.warn("[ride/request] SMS to secondary rider failed (non-blocking)", smsErr);
        }
      }
    }

    // Dispatch for immediate rides
    if (!scheduled_at) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
        const dispatchBody = JSON.stringify({
          ride_id: rideId,
          vehicle_type,
          pickup_lat,
          pickup_lng,
          allow_downgrade,
        });

        let dispatched = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(dispatchUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalSecret}`,
              },
              signal: AbortSignal.timeout(5_000),
              body: dispatchBody,
            });
            if (res.ok) {
              dispatched = true;
              break;
            }
          } catch {
            /* retry */
          }
          if (attempt < 2)
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!dispatched) {
          logger.error("[ride/request] dispatch failed after 3 retries", {
            ride_id: rideId,
          });
        }
      }
    }

    return Response.json({
      ride_id: rideId,
      fare_breakdown: fareBreakdown,
      status: "pending",
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[ride/request] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
